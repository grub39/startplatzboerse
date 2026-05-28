import { registerRootComponent } from 'expo';
import { Text, View, ScrollView, StyleSheet } from 'react-native';

function BootErrorScreen({ message }: { message: string }) {
  return (
    <View style={bootStyles.root}>
      <ScrollView contentContainerStyle={bootStyles.scroll}>
        <Text style={bootStyles.title}>App-Start fehlgeschlagen</Text>
        <Text style={bootStyles.body}>{message}</Text>
      </ScrollView>
    </View>
  );
}

const bootStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#323232', padding: 24, paddingTop: 48 },
  scroll: { flexGrow: 1 },
  title: { color: '#00bcd4', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  body: { color: '#f0f0f0', fontSize: 13, lineHeight: 20 },
});

try {
  const App = require('./App').default;
  registerRootComponent(App);
} catch (error) {
  const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
  console.error('Bootstrap-Fehler:', error);
  registerRootComponent(() => BootErrorScreen({ message }));
}
