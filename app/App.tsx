import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { 
  ActivityIndicator, 
  AppState,
  type AppStateStatus,
  BackHandler,
  StyleSheet, 
  Text, 
  View, 
  Pressable, 
  Modal, 
  TextInput, 
  Keyboard,
  KeyboardAvoidingView,
  LogBox,
  StatusBar as RNStatusBar,
  Platform,
  ToastAndroid
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

// Echte Push-Infrastruktur Imports
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

import { supabase, supabaseConfigured } from '@/lib/supabase';
import { syncSupportMessagesFromMatrix } from '@/lib/supportMatrix';
import { countUnreadSupportMessages, markSupportMessagesSeen } from '@/lib/supportUnread';
import { colors, radius } from './src/theme';

import { flushPendingWatchlist } from './src/lib/watchlist';
import { SearchScreen } from './src/screens/SearchScreen';
import { WatchlistScreen } from './src/screens/WatchlistScreen';
import { SellScreen } from './src/screens/SellScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ListingDetailScreen } from './src/screens/ListingDetailScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ToastPopup } from './src/components/ToastPopup';
import { TabButton } from './src/components/TabButton';

export type AppTab = 'search' | 'favorites' | 'sell' | 'messages' | 'account';

LogBox.ignoreLogs([
  'AuthApiError: Invalid Refresh Token',
  'Invalid Refresh Token: Refresh Token Not Found',
]);

const notificationRuntimeState: {
  appState: AppStateStatus;
  tab: AppTab;
  activeConversationId: string | null;
  supportChatActive: boolean;
} = {
  appState: AppState.currentState,
  tab: 'search',
  activeConversationId: null,
  supportChatActive: false,
};

function getNotificationConversationId(data: Record<string, unknown>) {
  if (typeof data.conversationId === 'string') return data.conversationId;
  if (typeof data.conversation_id === 'string') return data.conversation_id;
  return null;
}

function isMessageNotification(data: Record<string, unknown>) {
  return data.type === 'message' || !!getNotificationConversationId(data);
}

function isSupportNotification(data: Record<string, unknown>) {
  return (
    data.type === 'support' ||
    data.screen === 'support' ||
    typeof data.ticket_id === 'string'
  );
}

function isInvalidRefreshTokenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('Invalid Refresh Token') || message.includes('Refresh Token Not Found');
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

function AppShell() {
  const [tab, setTab] = useState<AppTab>('search');
  const [session, setSession] = useState<Session | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(true);

  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authStep, setAuthStep] = useState<'email' | 'otp'>('email');
  const [authEmail, setAuthEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [globalPopup, setGlobalPopup] = useState<{
    visible: boolean;
    type: 'error' | 'info' | 'success';
    title: string;
    text: string;
  }>({ visible: false, type: 'error', title: '', text: '' });

  const [detailListingId, setDetailListingId] = useState<string | null>(null);
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messageNotification, setMessageNotification] = useState<{
    conversationId: string | null;
    nonce: number;
  }>({ conversationId: null, nonce: 0 });
  const [openSupportSignal, setOpenSupportSignal] = useState(0);
  const [openSupportWithChat, setOpenSupportWithChat] = useState(false);
  const [supportNotificationNonce, setSupportNotificationNonce] = useState(0);
  const [pendingOpenSupport, setPendingOpenSupport] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const lastBackPressRef = useRef(0);
  const consumeDashboardAndroidBackRef = useRef<(() => boolean) | null>(null);
  const consumeSellAndroidBackRef = useRef<(() => boolean) | null>(null);

  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : insets.top;
  const authModalVisibleRef = useRef(authModalVisible);
  authModalVisibleRef.current = authModalVisible;

  /** Android nutzt keyboard resize – kein zusätzliches marginBottom für Tastaturhöhe. */
  const authSheetBottomOffset = useMemo(() => {
    const resting = Math.max(insets.bottom, 20);
    if (!authModalVisible || keyboardHeight <= 0) return resting;
    if (Platform.OS === 'android') return Math.max(insets.bottom, 12);
    return keyboardHeight + Math.max(insets.bottom, 8);
  }, [authModalVisible, keyboardHeight, insets.bottom]);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data ?? {};
        const suppressForegroundMessage =
          notificationRuntimeState.appState === 'active' &&
          isMessageNotification(data);
        const suppressForegroundSupport =
          notificationRuntimeState.appState === 'active' &&
          isSupportNotification(data) &&
          notificationRuntimeState.supportChatActive;

        const suppress = suppressForegroundMessage || suppressForegroundSupport;

        return {
          shouldShowAlert: !suppress,
          shouldShowBanner: !suppress,
          shouldShowList: !suppress,
          shouldPlaySound: !suppress,
          shouldSetBadge: false,
        };
      },
    });
  }, []);

  useEffect(() => {
    setAppReady(true);
  }, []);

  useEffect(() => {
    if (!appReady) return;
    SplashScreen.hideAsync().catch(() => undefined);
  }, [appReady]);

  // HIER EINGEBAUT: Zukunftssichere Token-Registrierung für unbegrenzt viele Geräte
  async function saveDeviceToken(userId: string) {
    if (!Device.isDevice) {
      console.log('Push-Benachrichtigungen funktionieren nur auf echten Geräten, nicht im Simulator.');
      return;
    }

    try {
      // 1. Berechtigungen abfragen
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('User hat die Push-Berechtigungen abgelehnt.');
        return;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Nachrichten',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#00bcd4',
        });
      }

      // 2. EAS Project ID aus der app.json greifen
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      
      // 3. Eindeutigen Push Token generieren
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData.data;

      // 4. Per Upsert krisensicher in die neue Multi-Device Tabelle schieben
      await supabase
        .from('device_tokens')
        .upsert({ 
          user_id: userId,
          token: token,
          platform: Platform.OS, // Speichert 'ios' oder 'android'
          provider: 'expo'
        }, { onConflict: 'token' });

      console.log(
        "Geräte-Token gesichert:",
        token.slice(0, 28) + '…',
        Platform.OS,
      );
    } catch (error) {
      console.error("Fehler bei der Push-Token Registrierung:", error);
    }
  }

  async function checkOnboardingStatus(userId: string) {
    setOnboardingLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('has_completed_onboarding')
        .eq('id', userId)
        .single();
      setOnboardingComplete(data?.has_completed_onboarding ?? false);
    } catch (err) {
      console.error('Fehler beim Onboarding-Check:', err);
      setOnboardingComplete(false);
    } finally {
      setOnboardingLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        if (isInvalidRefreshTokenError(error)) {
          supabase.auth.signOut({ scope: 'local' });
        } else {
          console.error('Session konnte nicht geladen werden:', error);
          supabase.auth.signOut({ scope: 'local' });
        }
        setSession(null);
        setOnboardingComplete(false);
        setOnboardingLoading(false);
        return;
      }
      const currentSession = data.session;
      setSession(currentSession);
      if (currentSession?.user?.id) {
        checkOnboardingStatus(currentSession.user.id);
      } else {
        setOnboardingLoading(false);
      }
    }).catch((error) => {
      if (!isInvalidRefreshTokenError(error)) {
        console.error('Session konnte nicht geladen werden:', error);
      }
      supabase.auth.signOut({ scope: 'local' });
      setSession(null);
      setOnboardingComplete(false);
      setOnboardingLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_OUT' || !nextSession) {
        setOnboardingComplete(false);
        setOnboardingLoading(false);
        return;
      }
      if (nextSession?.user?.id) {
        if (event === 'SIGNED_IN') {
          void flushPendingWatchlist();
        }
        checkOnboardingStatus(nextSession.user.id);
      } else {
        setOnboardingComplete(false);
        setOnboardingLoading(false);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // HIER EINGEBAUT: Trigger für die Push-Token-Sicherung bei Login / Session-Wechsel
  useEffect(() => {
    if (session?.user?.id) {
      saveDeviceToken(session.user.id);
    }
  }, [session?.user?.id]);

  const refreshUnreadCount = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setUnreadTotal(0);
      return;
    }

    const { data } = await supabase
      .from('conversations')
      .select(`messages(is_read, sender_id)`)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

    if (data) {
      const total = data.reduce((sum, chat) => {
        const unreadInChat = (chat.messages as any[] ?? []).filter(
          (msg) => !msg.is_read && msg.sender_id !== userId
        ).length;
        return sum + unreadInChat;
      }, 0);
      setUnreadTotal(total);
    }
  }, [session?.user?.id]);

  const refreshSupportUnreadCount = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setSupportUnreadCount(0);
      return;
    }

    const count = await countUnreadSupportMessages(userId);
    setSupportUnreadCount(count);
  }, [session?.user?.id]);

  const handleSupportMessagesSeen = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    await markSupportMessagesSeen(userId);
    setSupportUnreadCount(0);
  }, [session?.user?.id]);

  useEffect(() => {
    notificationRuntimeState.tab = tab;
    notificationRuntimeState.activeConversationId = activeConversationId;
  }, [tab, activeConversationId]);

  useEffect(() => {
    notificationRuntimeState.appState = AppState.currentState;

    const subscription = AppState.addEventListener('change', (nextState) => {
      notificationRuntimeState.appState = nextState;

      if (
        session?.user?.id &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        syncSupportMessagesFromMatrix().catch(() => undefined);
      }
    });

    return () => subscription.remove();
  }, [session?.user?.id]);

  const navigateToSupportChat = useCallback(() => {
    setDetailListingId(null);
    setTab('account');
    setOpenSupportSignal((current) => current + 1);
    setSupportNotificationNonce((current) => current + 1);
    setOpenSupportWithChat(true);
  }, []);

  const openFromNotification = useCallback((response: Notifications.NotificationResponse | null | undefined) => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
      return;
    }

    const data = response.notification.request.content.data ?? {};

    if (isSupportNotification(data)) {
      if (session?.user?.id && !onboardingLoading && onboardingComplete) {
        navigateToSupportChat();
      } else {
        setDetailListingId(null);
        setTab('account');
        setPendingOpenSupport(true);
      }
      return;
    }

    const conversationId = getNotificationConversationId(data);
    setDetailListingId(null);
    setPendingChatId(conversationId);
    setTab('messages');
  }, [navigateToSupportChat, onboardingComplete, onboardingLoading, session?.user?.id]);

  useEffect(() => {
    if (!pendingOpenSupport) return;
    if (!session?.user?.id || onboardingLoading || !onboardingComplete) {
      return;
    }

    setPendingOpenSupport(false);
    navigateToSupportChat();
  }, [
    navigateToSupportChat,
    onboardingComplete,
    onboardingLoading,
    pendingOpenSupport,
    session?.user?.id,
  ]);

  useEffect(() => {
    let cancelled = false;

    const handleColdStartNotification = () => {
      if (cancelled) return;
      Notifications.getLastNotificationResponseAsync()
        .then(openFromNotification)
        .then(() => Notifications.clearLastNotificationResponseAsync())
        .catch((error) => {
          console.error('Notification-Startziel konnte nicht verarbeitet werden:', error);
        });
    };

    // Nach erstem Frame, damit Navigation nicht beim App-Start crasht.
    const coldStartTimer = setTimeout(handleColdStartNotification, 600);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromNotification(response);
    });

    return () => {
      cancelled = true;
      clearTimeout(coldStartTimer);
      subscription.remove();
    };
  }, [openFromNotification]);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data ?? {};

      if (isSupportNotification(data)) {
        setSupportNotificationNonce((current) => current + 1);
        if (!notificationRuntimeState.supportChatActive) {
          setTimeout(() => {
            refreshSupportUnreadCount();
          }, 400);
        }
        return;
      }

      if (!isMessageNotification(data)) return;

      const conversationId = getNotificationConversationId(data);
      setMessageNotification((current) => ({
        conversationId,
        nonce: current.nonce + 1,
      }));

      if (conversationId !== notificationRuntimeState.activeConversationId) {
        setUnreadTotal((current) => current + 1);
      }

      setTimeout(() => {
        refreshUnreadCount();
      }, 900);
    });

    return () => subscription.remove();
  }, [refreshUnreadCount, refreshSupportUnreadCount]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      if (!authModalVisibleRef.current) return;
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setUnreadTotal(0);
      setSupportUnreadCount(0);
      return;
    }

    refreshUnreadCount();
    refreshSupportUnreadCount();

    const channel = supabase
      .channel('global-badge-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        refreshUnreadCount();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const row = payload.new as { sender_type?: string };
        if (row.sender_type === 'admin' && !notificationRuntimeState.supportChatActive) {
          refreshSupportUnreadCount();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refreshUnreadCount, refreshSupportUnreadCount, session?.user?.id, tab]);

  async function handleRequestOtp() {
    if (!authEmail.trim()) {
      setAuthError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim().toLowerCase(),
      });
      if (error) throw error;
      setAuthStep('otp');
      setGlobalPopup({
        visible: true,
        type: 'success',
        title: 'Prüfe dein Postfach',
        text: 'Wir haben dir einen 6-stelligen Login-Code gesendet.'
      });
    } catch (err: any) {
      setAuthError(err.message || 'Code-Anforderung fehlgeschlagen.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    if (!authCode.trim() || authCode.trim().length < 6) {
      setAuthError('Bitte gib den 6-stelligen Code ein.');
      return;
    }
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: authEmail.trim().toLowerCase(),
        token: authCode.trim(),
        type: 'email',
      });
      if (error) throw error;
      await flushPendingWatchlist();
      setAuthModalVisible(false);
      setAuthStep('email');
      setAuthEmail('');
      setAuthCode('');
    } catch (err: any) {
      setAuthError(err.message || 'Falscher oder abgelaufener Code.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  const closeAuthModal = useCallback(() => {
    Keyboard.dismiss();
    setKeyboardHeight(0);
    setAuthModalVisible(false);
    setAuthStep('email');
    setAuthCode('');
    setAuthError(null);
  }, []);

  const handleTabPress = useCallback((nextTab: AppTab) => {
    setDetailListingId(null);
    if (nextTab !== 'messages') {
      setActiveConversationId(null);
    }
    setTab(nextTab);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (authModalVisible) {
        closeAuthModal();
        return true;
      }

      // Detail and chat overlays handle Android back themselves so their close animation is kept.
      if (detailListingId || activeConversationId) {
        return false;
      }

      if (tab === 'account' && consumeDashboardAndroidBackRef.current?.()) {
        return true;
      }

      if (tab === 'sell' && consumeSellAndroidBackRef.current?.()) {
        return true;
      }

      if (tab !== 'search') {
        handleTabPress('search');
        return true;
      }

      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        BackHandler.exitApp();
        return true;
      }

      lastBackPressRef.current = now;
      ToastAndroid.show('Zum Beenden erneut Zurück drücken', ToastAndroid.SHORT);
      return true;
    });

    return () => subscription.remove();
  }, [activeConversationId, authModalVisible, closeAuthModal, detailListingId, handleTabPress, tab]);

  const renderGuestPlaceholder = (icon: string, title: string, subline: string, headerTitle: string) => (
    <View style={styles.guestContainer}>
      <View style={[styles.guestHeader, { paddingTop: statusBarHeight + 16 }]}>
        <Text style={styles.guestHeaderTitle}>{headerTitle}</Text>
      </View>
      <View style={styles.guestCardWrapper}>
        <View style={styles.guestCard}>
          <View style={styles.guestIconCircle}>
            <FontAwesome5 name={icon} size={26} color={colors.cyan} />
          </View>
          <Text style={styles.guestTitle}>{title}</Text>
          <Text style={styles.guestSubline}>{subline}</Text>
          <Pressable style={styles.guestButton} onPress={() => setAuthModalVisible(true)}>
            <Text style={styles.guestButtonText}>Jetzt einloggen</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderTabContent = () => {
    switch (tab) {
      case 'search':
        return (
          <SearchScreen
            session={session}
            onOpenListing={setDetailListingId}
            onGoLogin={() => setAuthModalVisible(true)}
          />
        );
      case 'favorites':
        return session
          ? <WatchlistScreen session={session} onOpenListing={setDetailListingId} />
          : renderGuestPlaceholder('heart', 'Deine Merkliste', 'Logge dich ein, um deine favorisierten Startplätze dauerhaft zu sichern.', 'Merkliste');
      case 'sell':
        return session
          ? <SellScreen
              session={session}
              onGoLogin={() => setAuthModalVisible(true)}
              onConsumeAndroidBackPress={(handler) => {
                consumeSellAndroidBackRef.current = handler;
              }}
            />
          : renderGuestPlaceholder('plus-circle', 'Startplatz inserieren', 'Erstelle im Handumdrehen ein Inserat und finde schnell einen passenden Käufer.', 'Inserieren');
      case 'messages':
        return session
          ? (
            <ChatScreen
              session={session}
              initialConversationId={pendingChatId}
              onInitialConversationHandled={() => setPendingChatId(null)}
              onActiveConversationChange={setActiveConversationId}
              notificationConversationId={messageNotification.conversationId}
              notificationNonce={messageNotification.nonce}
              onUnreadStateChange={refreshUnreadCount}
            />
          )
          : renderGuestPlaceholder('comments', 'Deine Nachrichten', 'Tausche dich direkt mit Käufern und Verkäufern über die Ticketübergabe aus.', 'Chats');
      case 'account':
        return (
          <DashboardScreen
            session={session}
            onSignOut={() => supabase.auth.signOut()}
            onGoLogin={() => setAuthModalVisible(true)}
            openSupportSignal={openSupportSignal}
            openSupportWithChat={openSupportWithChat}
            onOpenSupportWithChatHandled={() => setOpenSupportWithChat(false)}
            supportNotificationNonce={supportNotificationNonce}
            onSupportChatActiveChange={(active) => {
              notificationRuntimeState.supportChatActive = active;
            }}
            supportUnreadCount={supportUnreadCount}
            onSupportMessagesSeen={handleSupportMessagesSeen}
            onPushMessagesEnabled={() => {
              if (session?.user?.id) {
                saveDeviceToken(session.user.id);
              }
            }}
            onConsumeAndroidBackPress={(handler) => {
              consumeDashboardAndroidBackRef.current = handler;
            }}
          />
        );
      default:
        return null;
    }
  };

  if (!supabaseConfigured) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.configErrorTitle}>Konfiguration fehlt</Text>
        <Text style={styles.configErrorText}>
          EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_ANON_KEY fehlen. Lege in app/.env.local die Werte an
          (siehe .env.example) und starte mit: npx expo start -c
        </Text>
      </View>
    );
  }

  if (session && onboardingLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors?.cyan || '#00bcd4'} />
      </View>
    );
  }

  if (session && !onboardingComplete) {
    return (
      <View style={styles.safe}>
        <StatusBar style="light" />
        <OnboardingScreen
          session={session}
          onComplete={() => setOnboardingComplete(true)}
        />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar style="light" />

      {/* 1. Ebene: Die Haupt-Tabs */}
      <View style={styles.content}>
        {renderTabContent()}
      </View>

      {/* 2. Ebene: Detail-Screen */}
      {detailListingId ? (
        <ListingDetailScreen
          listingId={detailListingId}
          session={session}
          onClose={() => setDetailListingId(null)}
          onGoLogin={() => setAuthModalVisible(true)}
        />
      ) : null}

      {/* 3. Ebene: Auth Modal */}
      <Modal
        visible={authModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeAuthModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeAuthModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.authKeyboardAvoid}
            keyboardVerticalOffset={Platform.OS === 'ios' ? statusBarHeight : 0}
          >
          <Pressable
            style={[styles.authSheet, { marginBottom: authSheetBottomOffset }]}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.appleIndicator} />

            {authStep === 'email' ? (
              <View style={styles.authStepWrapper}>
                <Text style={styles.authTitle}>Willkommen zurück</Text>
                <Text style={styles.authSubline}>Melde dich wie in der Webapp ganz unkompliziert per E-Mail-Code an.</Text>
                {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
                <View style={styles.authForm}>
                  <TextInput
                    style={styles.authInput}
                    placeholder="Deine E-Mail-Adresse"
                    placeholderTextColor="#555"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={authEmail}
                    onChangeText={setAuthEmail}
                    cursorColor={colors.cyan}
                    selectionColor={colors.cyan}
                    importantForAutofill="no"
                    autoComplete="off"
                    textContentType="none"
                  />
                  <Pressable
                    style={[styles.authButton, authSubmitting ? { opacity: 0.6 } : null]}
                    onPress={handleRequestOtp}
                    disabled={authSubmitting}
                  >
                    {authSubmitting
                      ? <ActivityIndicator color="#000" />
                      : <Text style={styles.authButtonText}>Code anfordern</Text>}
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.authStepWrapper}>
                <Text style={styles.authTitle}>Prüfe dein Postfach</Text>
                <Text style={styles.authSubline}>
                  Wir haben einen 6-stelligen Code an{' '}
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{authEmail}</Text> gesendet.
                </Text>
                {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
                <View style={styles.authForm}>
                  <TextInput
                    style={[styles.authInput, { textAlign: 'center', letterSpacing: 6, fontSize: 20 }]}
                    placeholder="000000"
                    placeholderTextColor="#444"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={authCode}
                    onChangeText={setAuthCode}
                    cursorColor={colors.cyan}
                    selectionColor={colors.cyan}
                    importantForAutofill="no"
                    autoComplete="off"
                    textContentType="none"
                  />
                  <Pressable
                    style={[styles.authButton, authSubmitting ? { opacity: 0.6 } : null]}
                    onPress={handleVerifyOtp}
                    disabled={authSubmitting}
                  >
                    {authSubmitting
                      ? <ActivityIndicator color="#000" />
                      : <Text style={styles.authButtonText}>Bestätigen & Einloggen</Text>}
                  </Pressable>
                  <Pressable style={styles.backButton} onPress={() => { setAuthStep('email'); setAuthError(null); }}>
                    <Text style={styles.backButtonText}>Zurück zur E-Mail</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Global Toast */}
      <ToastPopup
        visible={globalPopup.visible}
        type={globalPopup.type}
        title={globalPopup.title}
        text={globalPopup.text}
        onConfirm={() => setGlobalPopup({ ...globalPopup, visible: false })}
      />

      {/* 4. Ebene: Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TabButton active={tab === 'search'}    label="Suchen"     onPress={() => handleTabPress('search')} />
        <TabButton active={tab === 'favorites'} label="Merkliste"  onPress={() => handleTabPress('favorites')} />
        <TabButton active={tab === 'sell'}      label="Inserieren" onPress={() => handleTabPress('sell')} />
        <TabButton active={tab === 'messages'}  label="Chats"      badgeCount={unreadTotal} onPress={() => handleTabPress('messages')} />
        <TabButton
          active={tab === 'account'}
          label="Dashboard"
          badgeCount={supportUnreadCount}
          onPress={() => handleTabPress('account')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#323232' },
  content: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 2,
    paddingTop: 6,
    paddingHorizontal: 8,
    backgroundColor: '#191919',
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    zIndex: 9999,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#2e2e2e',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
  },
  otaLoadingText: { color: '#888888', fontSize: 14, fontWeight: '600' },
  configErrorTitle: { color: '#ffffff', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  configErrorText: { color: '#888888', fontSize: 14, lineHeight: 20, textAlign: 'center' },

  guestContainer: { flex: 1, backgroundColor: '#323232', paddingHorizontal: 20 },
  guestHeader: { flexDirection: 'row', alignItems: 'center' },
  guestHeaderTitle: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  guestCardWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  guestCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1c1c1c',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  guestIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 188, 212, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  guestTitle: { color: '#ffffff', fontSize: 18, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  guestSubline: { color: '#888888', fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 24, paddingHorizontal: 6 },
  guestButton: { width: '100%', height: 50, backgroundColor: colors.cyan, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  guestButtonText: { color: '#000000', fontSize: 15, fontWeight: '900' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  authKeyboardAvoid: { width: '100%', justifyContent: 'flex-end' },
  authSheet: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: '#1c1c1c',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  appleIndicator: { width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 22 },
  authStepWrapper: { width: '100%', alignItems: 'center' },
  authTitle: { color: '#ffffff', fontSize: 20, fontWeight: '900', marginBottom: 6, textAlign: 'center' },
  authSubline: { color: '#888888', fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 16, marginBottom: 24 },
  authForm: { width: '100%', gap: 12 },
  authInput: {
    backgroundColor: '#111111',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 52,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  authButton: { height: 52, backgroundColor: colors.cyan, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  authButtonText: { color: '#000000', fontSize: 15, fontWeight: '900' },
  backButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, marginTop: 4 },
  backButtonText: { color: '#666666', fontSize: 13, fontWeight: '700' },
  errorText: { color: '#ff4444', fontSize: 13, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
});