import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch, // <-- NEU: Import des nativen Schiebereglers
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome5 } from '@expo/vector-icons';
import { resolveAvatarDisplayUri, uploadProfileAvatar } from '../lib/avatar';
import { supabase } from '../lib/supabase';
import { EmptyDashboard } from '../components/DashboardComponents';
import { EditListingModal } from '../components/EditListingModal';
import { ToastPopup } from '../components/ToastPopup';
import { SupportChatPanel } from '../components/SupportChatPanel';
import { formatAppVersionLabel, getReleaseNotesForVersion } from '../constants/releaseNotes';
import { fetchActiveSupportTicket, isActiveSupportTicketStatus } from '../lib/supportTicket';
import { colors, radius } from '../theme';
import type { Listing, Profile, WatchlistEntry } from '../types';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const NAV_HEIGHT = 74;
const BG_MAIN = '#2e2e2e';

type SettingsPage = 'overview' | 'profil' | 'benachrichtigungen' | 'support' | 'rechtliches' | 'info';

type Props = {
  session: Session | null;
  onSignOut: () => void;
  onGoLogin?: () => void;
  openSupportSignal?: number;
  supportNotificationNonce?: number;
  onSupportChatActiveChange?: (active: boolean) => void;
  onPushMessagesEnabled?: () => void;
  /** Android: true = Zurück wurde im Dashboard verarbeitet */
  onConsumeAndroidBackPress?: (handler: (() => boolean) | null) => void;
};

export function DashboardScreen({
  session,
  onSignOut,
  onGoLogin,
  openSupportSignal = 0,
  supportNotificationNonce = 0,
  onSupportChatActiveChange,
  onPushMessagesEnabled,
  onConsumeAndroidBackPress,
}: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownListings, setOwnListings] = useState<Listing[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // State für den Push-Schieberegler
  const [pushNewMessages, setPushNewMessages] = useState(false);

  // Unifizierter State für dein Custom Toast-Popup
  const [popup, setPopup] = useState<{
    visible: boolean;
    type: 'error' | 'info' | 'success' | 'warning' | 'destructive';
    title: string;
    text: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({ visible: false, type: 'error', title: '', text: '' });

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('overview');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [supportChatStarted, setSupportChatStarted] = useState(false);

  const insets = useSafeAreaInsets();

  const openSupportSettings = useCallback(() => {
    setSettingsVisible(true);
    setSettingsPage('support');
    setSupportChatStarted(true);
  }, []);

  useEffect(() => {
    if (openSupportSignal === 0) return;
    openSupportSettings();
  }, [openSupportSignal, openSupportSettings]);

  useEffect(() => {
    const isSupportActive =
      settingsVisible && settingsPage === 'support' && supportChatStarted;
    onSupportChatActiveChange?.(isSupportActive);
  }, [settingsVisible, settingsPage, supportChatStarted, onSupportChatActiveChange]);

  const hydrateSupportChatFromTicket = useCallback(async (userId: string) => {
    try {
      const ticket = await fetchActiveSupportTicket(userId);
      if (ticket) {
        setSupportChatStarted(true);
      }
    } catch (err) {
      console.warn('Support-Ticket prüfen:', err);
    }
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setSupportChatStarted(false);
      return;
    }

    hydrateSupportChatFromTicket(session.user.id);

    const channel = supabase
      .channel(`support-ticket-status-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const status = (payload.new as { status?: string }).status;
          if (status && isActiveSupportTicketStatus(status)) {
            setSupportChatStarted(true);
            return;
          }
          if (status && !isActiveSupportTicketStatus(status)) {
            setSupportChatStarted(false);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'support_tickets',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          setSupportChatStarted(false);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hydrateSupportChatFromTicket, session?.user?.id]);

  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : insets.top;
  const modalHeight = SCREEN_HEIGHT - statusBarHeight - NAV_HEIGHT;

  const settingsAnim = useRef(new Animated.Value(-SCREEN_HEIGHT)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  const loadDashboard = useCallback(async () => {
    if (!session?.user?.id) {
      setProfile(null);
      setOwnListings([]);
      setWatchlist([]);
      setLoading(false);
      return;
    }

    try {
      // push_new_messages wird jetzt direkt mit abgefragt
      const [profileRes, ownRes, watchRes] = await Promise.all([
        supabase.from('profiles').select('nickname, updated_at, avatar_url, push_new_messages, registered_email').eq('id', session.user.id).single(),
        supabase.from('listings').select('id, category, event_name, event_date, location, price, old_price, distance, distance_km, status, approved').eq('user_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('watchlist').select('id').eq('user_id', session.user.id),
      ]);
      if (profileRes.error) throw profileRes.error;
      
      const profData = profileRes.data as any;
      const authEmail = session.user.email?.trim().toLowerCase() ?? null;
      if (profData && authEmail && !profData.registered_email) {
        const { data: patched } = await supabase
          .from('profiles')
          .update({ registered_email: authEmail })
          .eq('id', session.user.id)
          .select('nickname, updated_at, avatar_url, push_new_messages, registered_email')
          .single();
        setProfile(patched ?? { ...profData, registered_email: authEmail });
      } else {
        setProfile(profData);
      }
      setPushNewMessages(profData?.push_new_messages ?? false); // State initialisieren

      await hydrateSupportChatFromTicket(session.user.id);
      
      setOwnListings((ownRes.data ?? []) as Listing[]);
      setWatchlist((watchRes.data ?? []) as WatchlistEntry[]);
    } catch (err) {
      console.log('Dashboard Load Error:', err);
      setPopup({
        visible: true,
        type: 'error',
        title: 'Verbindungsproblem',
        text: 'Dein Dashboard konnte nicht geladen werden.'
      });
    } finally {
      setLoading(false);
    }
  }, [hydrateSupportChatFromTicket, session?.user?.id]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (settingsVisible) {
      Animated.spring(settingsAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(settingsAnim, {
        toValue: -SCREEN_HEIGHT,
        duration: 260,
        useNativeDriver: true,
      }).start(() => {
        setSettingsPage('overview');
        slideAnim.setValue(SCREEN_WIDTH);
      });
    }
  }, [settingsVisible]);

  function openSubPage(page: SettingsPage) {
    setSettingsPage(page);
    slideAnim.setValue(SCREEN_WIDTH);
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 22,
      stiffness: 220,
      useNativeDriver: true,
    }).start();
  }

  const closeSubPage = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setSettingsPage('overview');
    });
  }, [slideAnim]);

  const handleAndroidBackPress = useCallback(() => {
    if (editingId) {
      setEditingId(null);
      return true;
    }

    if (!settingsVisible) {
      return false;
    }

    if (settingsPage !== 'overview') {
      closeSubPage();
      return true;
    }

    setSettingsVisible(false);
    return true;
  }, [closeSubPage, editingId, settingsPage, settingsVisible]);

  useEffect(() => {
    onConsumeAndroidBackPress?.(handleAndroidBackPress);
    return () => onConsumeAndroidBackPress?.(null);
  }, [handleAndroidBackPress, onConsumeAndroidBackPress]);

  function requireLogin() {
    setSettingsVisible(false);
    setTimeout(() => onGoLogin?.(), 260);
  }

  // FUNKTION: Speichert den Zustand des Schalters in Supabase
  async function handleTogglePushMessages(value: boolean) {
    if (!session?.user?.id) {
      onGoLogin?.();
      return;
    }

    // Optimistischer UI-Wechsel für maximale Apple-Flüssigkeit
    setPushNewMessages(value);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ push_new_messages: value })
        .eq('id', session.user.id);
      if (error) throw error;

      if (value) {
        onPushMessagesEnabled?.();
      }
    } catch (err) {
      // Rollback bei Fehler
      setPushNewMessages(!value);
      setPopup({
        visible: true,
        type: 'error',
        title: 'Einstellung fehlgeschlagen',
        text: 'Deine Änderung konnte nicht gespeichert werden. Prüfe deine Internetverbindung.'
      });
    }
  }

  async function pickAvatar() {
    if (!session?.user?.id) {
      onGoLogin?.();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return setPopup({
        visible: true,
        type: 'info',
        title: 'Fotozugriff benötigt',
        text: 'Bitte erlaube den Zugriff auf deine Mediathek in den Geräteeinstellungen.'
      });
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const displayUrl = await uploadProfileAvatar(session.user.id, asset.uri);
      const updatedAt = new Date().toISOString();

      await supabase
        .from('profiles')
        .update({ avatar_url: displayUrl, updated_at: updatedAt })
        .eq('id', session.user.id);

      setProfile((current) => ({
        ...(current ?? { nickname: null, updated_at: null }),
        avatar_url: displayUrl,
        updated_at: updatedAt,
      }));
      
      setPopup({
        visible: true,
        type: 'success',
        title: 'Profilbild aktualisiert',
        text: 'Dein neues Foto wurde erfolgreich hochgeladen.'
      });
    } catch (err) {
      setPopup({
        visible: true,
        type: 'error',
        title: 'Upload fehlgeschlagen',
        text: 'Das Profilfoto konnte nicht im Speicher gesichert werden.'
      });
    } finally { setUploading(false); }
  }

  async function archiveListing(listingId: string) {
    const { error } = await supabase.from('listings').update({ status: 'archived' }).eq('id', listingId);
    if (error) {
      setPopup({
        visible: true,
        type: 'error',
        title: 'Archivierung fehlgeschlagen',
        text: error.message
      });
    } else {
      loadDashboard();
    }
  }

  async function deleteListing(listingId: string) {
    const { error } = await supabase.from('listings').delete().eq('id', listingId);
    if (error) {
      setPopup({
        visible: true,
        type: 'error',
        title: 'Löschen fehlgeschlagen',
        text: error.message
      });
    } else {
      loadDashboard();
    }
  }

  function confirmArchiveListing(listingId: string) {
    setPopup({
      visible: true,
      type: 'warning',
      title: 'Inserat archivieren?',
      text: 'Dein Inserat wird aus der Suche entfernt, bleibt aber in deinem Dashboard sichtbar.',
      confirmText: 'Archivieren',
      cancelText: 'Abbrechen',
      onConfirm: () => {
        setPopup(p => ({ ...p, visible: false }));
        archiveListing(listingId);
      },
      onCancel: () => setPopup(p => ({ ...p, visible: false }))
    });
  }

  function confirmDeleteListing(listingId: string) {
    setPopup({
      visible: true,
      type: 'destructive',
      title: 'Inserat endgültig löschen?',
      text: 'Dieses Inserat wird dauerhaft entfernt. Das kann nicht rückgängig gemacht werden.',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      onConfirm: () => {
        setPopup(p => ({ ...p, visible: false }));
        deleteListing(listingId);
      },
      onCancel: () => setPopup(p => ({ ...p, visible: false }))
    });
  }

  const handleSignOutClick = () => {
    if (!session) {
      setSettingsVisible(false);
      setTimeout(() => onGoLogin?.(), 260);
      return;
    }

    setSettingsVisible(false);
    setTimeout(() => {
      setPopup({
        visible: true,
        type: 'info',
        title: 'Abmelden',
        text: 'Möchtest du dich wirklich abmelden?',
        confirmText: 'Abmelden',
        cancelText: 'Bleiben',
        onConfirm: () => {
          setPopup(p => ({ ...p, visible: false }));
          onSignOut();
        },
        onCancel: () => setPopup(p => ({ ...p, visible: false }))
      });
    }, 300);
  };

  const handleDeleteAccount = () => {
    if (!session) {
      setSettingsVisible(false);
      setTimeout(() => onGoLogin?.(), 260);
      return;
    }

    setSettingsVisible(false);
    setTimeout(() => {
      setPopup({
        visible: true,
        type: 'destructive',
        title: 'Konto löschen',
        text: 'Dein Konto und alle deine Daten werden unwiderruflich gelöscht. Bist du sicher?',
        confirmText: 'Löschen',
        cancelText: 'Abbrechen',
        onConfirm: async () => {
          setPopup(p => ({ ...p, visible: false }));
          await supabase.auth.signOut();
        },
        onCancel: () => setPopup(p => ({ ...p, visible: false }))
      });
    }, 300);
  };

  const settingsStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: modalHeight + statusBarHeight,
    backgroundColor: BG_MAIN,
    transform: [{ translateY: settingsAnim }],
    zIndex: 200,
    overflow: 'hidden' as const,
  };

  // ── SETTINGS OVERVIEW ──────────────────────────────────────────
  const renderOverview = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
      <Text style={s.groupLabel}>Konto</Text>
      <View style={s.menuGroup}>
        <SettingsRow icon="user-circle" label="Profil & Konto" onPress={session ? () => openSubPage('profil') : requireLogin} locked={!session} />
        <View style={s.divider} />
        <SettingsRow icon="bell" label="Benachrichtigungen" onPress={session ? () => openSubPage('benachrichtigungen') : requireLogin} locked={!session} />
      </View>

      <Text style={s.groupLabel}>Informationen</Text>
      <View style={s.menuGroup}>
        <SettingsRow
          icon="info-circle"
          label="Info"
          detail={formatAppVersionLabel()}
          onPress={() => openSubPage('info')}
        />
        <View style={s.divider} />
        <SettingsRow icon="question-circle" label="Hilfe & Support" onPress={() => openSubPage('support')} />
        <View style={s.divider} />
        <SettingsRow icon="file-alt" label="Rechtliches" onPress={() => openSubPage('rechtliches')} />
      </View>

      {session ? (
        <View style={s.dangerZone}>
          <Pressable style={s.dangerBtn} onPress={handleSignOutClick}>
            <FontAwesome5 name="sign-out-alt" size={15} color="#ff6b6b" />
            <Text style={s.dangerBtnText}>Abmelden</Text>
          </Pressable>
          <View style={s.divider} />
          <Pressable style={s.dangerBtn} onPress={handleDeleteAccount}>
            <FontAwesome5 name="trash-alt" size={15} color="#ff4444" />
            <Text style={[s.dangerBtnText, { color: '#ff4444' }]}>Konto löschen</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={s.loginButton} onPress={onGoLogin}>
          <FontAwesome5 name="sign-in-alt" size={15} color="#000000" />
          <Text style={s.loginButtonText}>Jetzt einloggen</Text>
        </Pressable>
      )}

    </ScrollView>
  );

  const renderInfo = () => {
    const notes = getReleaseNotesForVersion();

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
        <View style={s.infoHero}>
          <View style={s.infoIconCircle}>
            <FontAwesome5 name="running" size={26} color={colors.cyan} />
          </View>
          <Text style={s.infoAppName}>Startplatzbörse</Text>
          <Text style={s.infoVersion}>Version {notes.version}</Text>
        </View>

        {notes.hasDetails ? (
          <>
            {notes.changes.length > 0 ? (
              <>
                <Text style={s.groupLabel}>Neuerungen</Text>
                <View style={s.menuGroup}>
                  {notes.changes.map((item) => (
                    <View key={item} style={s.releaseItem}>
                      <FontAwesome5 name="plus-circle" size={14} color={colors.cyan} style={s.releaseIcon} />
                      <Text style={s.releaseText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {notes.fixes.length > 0 ? (
              <>
                <Text style={s.groupLabel}>Bugfixes</Text>
                <View style={s.menuGroup}>
                  {notes.fixes.map((item) => (
                    <View key={item} style={s.releaseItem}>
                      <FontAwesome5 name="wrench" size={14} color="#8bc34a" style={s.releaseIcon} />
                      <Text style={s.releaseText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : (
          <View style={s.lockedCard}>
            <Text style={s.lockedText}>
              Für Version {notes.version} sind noch keine Release-Notizen hinterlegt.
            </Text>
          </View>
        )}

        <Text style={s.infoFootnote}>
          Updates der App werden über Expo bereitgestellt. Nach einem Update die App einmal vollständig
          schließen und neu öffnen.
        </Text>
      </ScrollView>
    );
  };

  // ── PROFIL & KONTO ─────────────────────────────────────────────
  const renderProfil = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
      {!session ? (
        <View style={s.lockedCard}>
          <FontAwesome5 name="lock" size={18} color={colors.cyan} />
          <Text style={s.lockedTitle}>Login erforderlich</Text>
          <Text style={s.lockedText}>Melde dich an, um Profil, Konto und persönliche Benachrichtigungen zu verwalten.</Text>
          <Pressable style={s.loginButton} onPress={onGoLogin}>
            <Text style={s.loginButtonText}>Jetzt einloggen</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={s.groupLabel}>Profilfoto</Text>
      <View style={s.menuGroup}>
        <Pressable style={s.avatarRow} onPress={pickAvatar} disabled={uploading || !session}>
          <View style={s.avatarSmall}>
            {resolveAvatarDisplayUri(profile?.avatar_url, profile?.updated_at)
              ? (
                <Image
                  key={profile?.avatar_url ?? 'avatar'}
                  source={{ uri: resolveAvatarDisplayUri(profile?.avatar_url, profile?.updated_at)! }}
                  style={{ width: '100%', height: '100%' }}
                />
              )
              : <Text style={{ fontSize: 28 }}>👤</Text>}
            {uploading ? <View style={StyleSheet.absoluteFill}><ActivityIndicator color={colors.cyan} /></View> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Foto ändern</Text>
            <Text style={s.rowSub}>Aus Fotomediathek wählen</Text>
          </View>
          <FontAwesome5 name="chevron-right" size={12} color="#555" />
        </Pressable>
      </View>

      <Text style={s.groupLabel}>Informationen</Text>
      <View style={s.menuGroup}>
        <View style={s.infoRow}>
          <Text style={s.rowLabel}>Nutzername</Text>
          <Text style={s.rowValue}>{profile?.nickname || '—'}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.infoRow}>
          <Text style={s.rowLabel}>E-Mail</Text>
          <Text style={s.rowValue}>
            {profile?.registered_email ?? session?.user.email ?? '—'}
          </Text>
        </View>
        <View style={s.divider} />
        <View style={s.infoRow}>
          <Text style={s.rowLabel}>Mitglied seit</Text>
          <Text style={s.rowValue}>
            {profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString('de-DE') : '—'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );

  // ── BENACHRICHTIGUNGEN ─────────────────────────────────────────
  const renderBenachrichtigungen = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
      {!session ? (
        <View style={s.lockedCard}>
          <FontAwesome5 name="lock" size={18} color={colors.cyan} />
          <Text style={s.lockedTitle}>Login erforderlich</Text>
          <Text style={s.lockedText}>Melde dich an, um deine persönlichen Benachrichtigungen zu verwalten.</Text>
          <Pressable style={s.loginButton} onPress={onGoLogin}>
            <Text style={s.loginButtonText}>Jetzt einloggen</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={s.groupLabel}>Push-Benachrichtigungen</Text>
      <View style={s.menuGroup}>
        
        {/* FIX: Voll funktionsfähiger Apple-Style-Switch gekoppelt mit Supabase */}
        <View style={s.infoRow}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.rowLabel}>Neue Nachrichten</Text>
            <Text style={s.rowSub}>Zusätzlich zur E-Mail direkt als Push erhalten</Text>
          </View>
          <Switch
            trackColor={{ false: '#3a3a3c', true: colors.cyan }}
            thumbColor={Platform.OS === 'ios' ? '#ffffff' : (pushNewMessages ? colors.cyan : '#f4f3f4')}
            ios_backgroundColor="#3a3a3c"
            onValueChange={handleTogglePushMessages}
            value={pushNewMessages}
            disabled={!session}
          />
        </View>
        
        <View style={s.divider} />
        <View style={s.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Preissenkungen</Text>
            <Text style={s.rowSub}>Bei Merkzettel-Inseraten</Text>
          </View>
          <Text style={s.comingSoon}>Bald verfügbar</Text>
        </View>
        <View style={s.divider} />
        <View style={s.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Neue passende Inserate</Text>
            <Text style={s.rowSub}>Basierend auf deiner Suche</Text>
          </View>
          <Text style={s.comingSoon}>Bald verfügbar</Text>
        </View>
      </View>
      <Text style={s.footerNote}>Deine E-Mail-Meldungen bleiben dauerhaft aktiv. Push-Optionen erweitern den Echtzeit-Komfort.</Text>
    </ScrollView>
  );

  // ── SUPPORT ────────────────────────────────────────────────────
  const handleStartSupportChat = () => {
    if (!session) {
      requireLogin();
      return;
    }
    setSupportChatStarted(true);
  };

  const renderSupportBrowse = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[s.pageContent, { paddingTop: 12, paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Text style={s.supportIntro}>
        Wähle, wie du uns erreichen möchtest. Tippe auf „Support-Chat starten“ und schreib uns deine Frage.
      </Text>

      <Text style={s.groupLabel}>Kontakt</Text>
      <View style={s.menuGroup}>
        <Pressable
          style={s.linkRow}
          onPress={() => Linking.openURL('mailto:info@startplatzboerse.com')}
        >
          <FontAwesome5 name="envelope" size={14} color={colors.cyan} style={{ width: 20 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>E-Mail schreiben</Text>
            <Text style={s.rowSub}>info@startplatzboerse.com</Text>
          </View>
          <FontAwesome5 name="chevron-right" size={12} color="#555" />
        </Pressable>

        <View style={s.divider} />
        <Pressable style={s.linkRow} onPress={handleStartSupportChat}>
          <FontAwesome5 name="comments" size={14} color={colors.cyan} style={{ width: 20 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Support-Chat starten</Text>
            <Text style={s.rowSub}>Live im Chat – Antwort vom Team</Text>
          </View>
          <FontAwesome5 name="chevron-right" size={12} color="#555" />
        </Pressable>
      </View>

      <Text style={s.groupLabel}>Häufige Fragen</Text>
      <View style={s.menuGroup}>
        <FaqRow
          question="Wie funktioniert die Ummeldung?"
          answer="Du musst die Ummeldung vorab mit dem Veranstalter klären. Viele Veranstalter erlauben Namensänderungen gegen eine Gebühr."
        />
        <View style={s.divider} />
        <FaqRow
          question="Wie bezahle ich sicher?"
          answer="Wir empfehlen Zahlung per Überweisung oder PayPal Freunde & Familie. Treffe dich wenn möglich persönlich zur Übergabe."
        />
        <View style={s.divider} />
        <FaqRow
          question="Was kostet das Inserieren?"
          answer="Das Inserieren ist kostenlos. Die Plattform finanziert sich durch zukünftige Premium-Features."
        />
      </View>
    </ScrollView>
  );

  const renderSupportChat = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View
        style={[
          s.pageContent,
          {
            flex: 1,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <SupportChatPanel
          session={session}
          started={supportChatStarted}
          expanded
          onGoLogin={onGoLogin}
          isScreenActive={settingsVisible && settingsPage === 'support'}
          refreshNonce={supportNotificationNonce}
          onTicketClosed={() => setSupportChatStarted(false)}
        />
      </View>
    </KeyboardAvoidingView>
  );

  const renderSupport = () => (
    supportChatStarted ? renderSupportChat() : renderSupportBrowse()
  );

  // ── RECHTLICHES ────────────────────────────────────────────────
  const renderRechtliches = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
      <Text style={s.groupLabel}>Dokumente</Text>
      <View style={s.menuGroup}>
        <Pressable style={s.linkRow} onPress={() => Linking.openURL('https://deinedomain.de/datenschutz')}>
          <FontAwesome5 name="shield-alt" size={14} color={colors.cyan} style={{ width: 20 }} />
          <Text style={[s.rowLabel, { flex: 1 }]}>Datenschutzerklärung</Text>
          <FontAwesome5 name="chevron-right" size={12} color="#555" />
        </Pressable>
        <View style={s.divider} />
        <Pressable style={s.linkRow} onPress={() => Linking.openURL('https://deinedomain.de/agb')}>
          <FontAwesome5 name="file-contract" size={14} color={colors.cyan} style={{ width: 20 }} />
          <Text style={[s.rowLabel, { flex: 1 }]}>Nutzungsbedingungen</Text>
          <FontAwesome5 name="chevron-right" size={12} color="#555" />
        </Pressable>
        <View style={s.divider} />
        <Pressable style={s.linkRow} onPress={() => Linking.openURL('https://deinedomain.de/impressum')}>
          <FontAwesome5 name="building" size={14} color={colors.cyan} style={{ width: 20 }} />
          <Text style={[s.rowLabel, { flex: 1 }]}>Impressum</Text>
          <FontAwesome5 name="chevron-right" size={12} color="#555" />
        </Pressable>
      </View>
    </ScrollView>
  );

  const subPageTitles: Record<SettingsPage, string> = {
    overview: 'Einstellungen',
    profil: 'Profil & Konto',
    benachrichtigungen: 'Benachrichtigungen',
    support: 'Hilfe & Support',
    rechtliches: 'Rechtliches',
    info: 'Info',
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.dashboardContent, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 16 : 50 }]}>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Pressable style={styles.settingsButton} onPress={() => setSettingsVisible(true)}>
            <FontAwesome5 name="cog" size={20} color="#ffffff" />
          </Pressable>
        </View>

        <View style={styles.profileHero}>
          <Pressable style={styles.avatar} onPress={pickAvatar} disabled={uploading || !session}>
            {resolveAvatarDisplayUri(profile?.avatar_url, profile?.updated_at) ? (
              <Image
                key={profile?.avatar_url ?? 'avatar-main'}
                source={{
                  uri: resolveAvatarDisplayUri(profile?.avatar_url, profile?.updated_at)!,
                }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarFallback}>👤</Text>
            )}
            {uploading ? <View style={styles.avatarOverlay}><ActivityIndicator color={colors.cyan} /></View> : null}
          </Pressable>
          <View style={styles.profileCopy}>
            <Text style={styles.profileName}>{session ? (profile?.nickname || 'Sportler') : 'Gast'}</Text>
            <Text style={styles.profileSub}>
              {session
                ? `Mitglied seit ${profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString('de-DE') : '...'}`
                : 'Melde dich an, um dein Dashboard zu nutzen.'}
            </Text>
          </View>
          <View style={styles.profileStats}>
            <View style={styles.statItem}><Text style={styles.statNumber}>{ownListings.length}</Text><Text style={styles.statLabel}>Aktiv</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}><Text style={styles.statNumber}>{watchlist.length}</Text><Text style={styles.statLabel}>Merkzettel</Text></View>
          </View>
        </View>

        {!session ? (
          <View style={styles.dashboardStack}>
            <Text style={styles.sectionTitle}>Dein Dashboard</Text>
            <EmptyDashboard text="Logge dich ein, um Inserate, Merkliste und dein Profil zu verwalten." />
            <Pressable style={styles.guestLoginButton} onPress={onGoLogin}>
              <Text style={styles.guestLoginButtonText}>Jetzt einloggen</Text>
            </Pressable>
          </View>
        ) : loading ? (
          <ActivityIndicator color={colors.cyan} size="large" style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.dashboardStack}>
            <Text style={styles.sectionTitle}>Meine Inserate</Text>
            {ownListings.length === 0 ? <EmptyDashboard text="Noch keine Inserate." /> : ownListings.map((listing) => (
              <View key={listing.id} style={[styles.nativeOwnCard, listing.status === 'archived' && { opacity: 0.7 }]}>
                <Text style={styles.listingEyebrow}>{listing.category}</Text>
                <Text style={styles.listingTitle}>{listing.event_name}</Text>
                <View style={styles.priceContainer}><Text style={styles.listingPrice}>{listing.price} €</Text></View>
                <View style={styles.nativeCardActions}>
                  {listing.status !== 'archived' ? (
                    <>
                      <Pressable style={styles.nativeEditBtn} onPress={() => setEditingId(listing.id)}><Text style={styles.nativeEditBtnText}>Bearbeiten</Text></Pressable>
                      <Pressable style={styles.nativeArchiveBtn} onPress={() => confirmArchiveListing(listing.id)}><Text style={styles.nativeArchiveBtnText}>Archivieren</Text></Pressable>
                    </>
                  ) : (
                    <Pressable style={styles.nativeDeleteBtn} onPress={() => confirmDeleteListing(listing.id)}><Text style={styles.nativeDeleteBtnText}>Löschen</Text></Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── SETTINGS VORHANG ─────────────────────────────────── */}
      <Animated.View style={settingsStyle}>
        <View style={s.curtainHeader}>
          {settingsPage !== 'overview' ? (
            <Pressable onPress={closeSubPage} style={s.backBtn}>
              <FontAwesome5 name="chevron-left" size={14} color={colors.cyan} />
              <Text style={s.backBtnText}>Zurück</Text>
            </Pressable>
          ) : (
            <View style={{ width: 80 }} />
          )}
          <Text style={s.curtainTitle}>{subPageTitles[settingsPage]}</Text>
          <Pressable onPress={() => setSettingsVisible(false)} style={s.closeBtn}>
            <Text style={s.closeBtnText}>Fertig</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, display: settingsPage === 'overview' ? 'flex' : 'none' }}>
          {renderOverview()}
        </View>

        {settingsPage !== 'overview' ? (
          <Animated.View style={[{ flex: 1 }, { transform: [{ translateX: slideAnim }] }]}>
            {settingsPage === 'profil' ? renderProfil() : null}
            {settingsPage === 'benachrichtigungen' ? renderBenachrichtigungen() : null}
            {settingsPage === 'support' ? renderSupport() : null}
            {settingsPage === 'rechtliches' ? renderRechtliches() : null}
            {settingsPage === 'info' ? renderInfo() : null}
          </Animated.View>
        ) : null}
      </Animated.View>

      {editingId ? (
        <EditListingModal listingId={editingId} onClose={() => setEditingId(null)} onRefresh={loadDashboard} />
      ) : null}

      {/* Die unifizierte, weiche ToastPopup-Komponente */}
      <ToastPopup
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        text={popup.text}
        confirmText={popup.confirmText}
        cancelText={popup.cancelText}
        onConfirm={popup.onConfirm || (() => setPopup(p => ({ ...p, visible: false })))}
        onCancel={popup.onCancel}
        showCancel={!!popup.onCancel}
      />
    </View>
  );
}

// ── HELPER COMPONENTS ───────────────────────────────────────────

function SettingsRow({
  icon,
  label,
  detail,
  onPress,
  locked = false,
}: {
  icon: string;
  label: string;
  detail?: string;
  onPress: () => void;
  locked?: boolean;
}) {
  return (
    <Pressable style={s.linkRow} onPress={onPress} hitSlop={8}>
      <FontAwesome5 name={icon} size={15} color={locked ? '#444' : colors.cyan} style={{ width: 22 }} />
      <Text style={[s.rowLabel, { flex: 1, opacity: locked ? 0.4 : 1 }]}>{label}</Text>
      {detail ? <Text style={s.rowValue}>{detail}</Text> : null}
      {locked ? <FontAwesome5 name="lock" size={11} color="#555" /> : null}
      <FontAwesome5 name="chevron-right" size={12} color="#555" />
    </Pressable>
  );
}

// FaqRow bleibt unverändert...
function FaqRow({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen(o => !o)}>
      <View style={s.linkRow}>
        <FontAwesome5 name="question" size={13} color={colors.cyan} style={{ width: 22 }} />
        <Text style={[s.rowLabel, { flex: 1 }]}>{question}</Text>
        <FontAwesome5 name={open ? 'chevron-up' : 'chevron-down'} size={12} color="#555" />
      </View>
      {open ? <Text style={s.faqAnswer}>{answer}</Text> : null}
    </Pressable>
  );
}

// Styles bleiben identisch...
const s = StyleSheet.create({
  curtainHeader: { flexDirection: 'row', alignItems: 'center', justifyBox: 'space-between', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 54, paddingBottom: 14, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  curtainTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
    minHeight: 44,
    justifyContent: 'center',
  },
  backBtnText: { color: colors.cyan, fontSize: 15, fontWeight: '700' },
  closeBtn: { minWidth: 80, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  closeBtnText: { color: colors.cyan, fontSize: 15, fontWeight: '700' },
  pageContent: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, gap: 8 },
  supportIntro: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  groupLabel: { color: '#666666', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginLeft: 4 },
  menuGroup: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden', marginBottom: 8 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 16 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 52,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 52,
  },
  rowLabel: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  rowSub: { color: '#666', fontSize: 12, marginTop: 2, lineHeight: 16 },
  rowValue: { color: '#666666', fontSize: 14, maxWidth: '50%', textAlign: 'right' },
  comingSoon: { color: '#444', fontSize: 12, fontWeight: '600', fontStyle: 'italic' },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
    gap: 14,
  },
  avatarSmall: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#222', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dangerZone: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,68,68,0.12)', overflow: 'hidden', marginTop: 8, marginBottom: 8 },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 52,
    gap: 12,
  },
  dangerBtnText: { color: '#ff6b6b', fontSize: 15, fontWeight: '700' },
  loginButton: { height: 48, borderRadius: radius.md, backgroundColor: colors.cyan, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  loginButtonText: { color: '#000000', fontSize: 15, fontWeight: '900' },
  lockedCard: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,188,212,0.18)', padding: 18, alignItems: 'center', marginBottom: 12 },
  lockedTitle: { color: '#ffffff', fontSize: 16, fontWeight: '900', marginTop: 10, marginBottom: 6 },
  lockedText: { color: '#888888', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  footerNote: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 18, paddingHorizontal: 12 },
  infoHero: { alignItems: 'center', paddingVertical: 28, gap: 8, marginBottom: 8 },
  infoIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 188, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 188, 212, 0.25)',
  },
  infoAppName: { color: '#ffffff', fontSize: 20, fontWeight: '900' },
  infoVersion: { color: colors.cyan, fontSize: 15, fontWeight: '700' },
  releaseItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  releaseIcon: { marginTop: 2, width: 18 },
  releaseText: { flex: 1, color: '#cccccc', fontSize: 14, lineHeight: 20 },
  infoFootnote: { color: '#555', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 16, paddingHorizontal: 8 },
  faqAnswer: { color: '#888', fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingBottom: 14 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  dashboardContent: { paddingHorizontal: 16, gap: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '900' },
  settingsButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  profileHero: { backgroundColor: colors.card, borderRadius: 24, padding: 20, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  avatar: { width: 90, height: 90, borderRadius: 16, backgroundColor: '#222', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: { fontSize: 40 },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  profileCopy: { alignItems: 'center' },
  profileName: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  profileSub: { color: '#888', fontSize: 13 },
  profileStats: { flexDirection: 'row', paddingTop: 14, marginTop: 6, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)', width: '100%' },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  statNumber: { color: colors.cyan, fontSize: 16, fontWeight: '900' },
  statLabel: { color: '#666', fontSize: 10, textTransform: 'uppercase' },
  dashboardStack: { gap: 16 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  guestLoginButton: { height: 50, borderRadius: radius.md, backgroundColor: colors.cyan, alignItems: 'center', justifyContent: 'center' },
  guestLoginButtonText: { color: '#000000', fontSize: 15, fontWeight: '900' },
  nativeOwnCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  listingEyebrow: { color: colors.cyan, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  listingTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  priceContainer: { marginVertical: 4 },
  listingPrice: { color: colors.cyan, fontSize: 24, fontWeight: '900' },
  nativeCardActions: { flexDirection: 'row', gap: 10, marginTop: 10, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.05)', paddingTop: 12 },
  nativeEditBtn: { flex: 1, height: 40, backgroundColor: colors.cyan, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  nativeEditBtnText: { color: '#000', fontWeight: '900' },
  nativeArchiveBtn: { flex: 1, height: 40, backgroundColor: '#111', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)' },
  nativeArchiveBtnText: { color: '#ff4444', fontWeight: '800' },
  nativeDeleteBtn: { flex: 1, height: 40, backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,68,68,0.24)' },
  nativeDeleteBtnText: { color: '#ff4444', fontWeight: '900' },
});