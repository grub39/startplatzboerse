import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LegalSection } from '../constants/appDatenschutz';
import { colors } from '../theme';

type Props = {
  title: string;
  intro: string;
  standLabel?: string;
  sections: LegalSection[];
  footerNote?: string;
  contentContainerStyle?: object;
};

const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

function ParagraphText({ text }: { text: string }) {
  const parts = text.split(EMAIL_REGEX);
  if (parts.length === 1) {
    return <Text style={styles.paragraph}>{text}</Text>;
  }

  return (
    <Text style={styles.paragraph}>
      {parts.map((part, index) =>
        part.includes('@') ? (
          <Text
            key={`${part}-${index}`}
            style={styles.link}
            onPress={() => Linking.openURL(`mailto:${part}`)}
          >
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

export function LegalDocumentScroll({
  title,
  intro,
  standLabel,
  sections,
  footerNote,
  contentContainerStyle,
}: Props) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.docTitle}>{title}</Text>
      {standLabel ? <Text style={styles.stand}>Stand: {standLabel}</Text> : null}
      <Text style={styles.intro}>{intro}</Text>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.paragraphs.map((paragraph) => (
            <ParagraphText key={paragraph.slice(0, 48)} text={paragraph} />
          ))}
          {section.bullets?.map((bullet) => (
            <View key={bullet.slice(0, 48)} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      ))}

      {footerNote ? <Text style={styles.footer}>{footerNote}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 48,
    gap: 4,
  },
  docTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 4,
  },
  stand: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  intro: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
    gap: 6,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  paragraph: {
    color: '#b0b0b0',
    fontSize: 14,
    lineHeight: 21,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 4,
    marginTop: 2,
  },
  bulletDot: {
    color: colors.cyan,
    fontSize: 14,
    lineHeight: 21,
  },
  bulletText: {
    flex: 1,
    color: '#b0b0b0',
    fontSize: 14,
    lineHeight: 21,
  },
  link: {
    color: colors.cyan,
    textDecorationLine: 'underline',
  },
  footer: {
    color: '#666',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
  },
});
