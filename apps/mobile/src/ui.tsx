import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";

export const colors = {
  sea: "#123e3b",
  sand: "#f3eee6",
  paper: "#fffdf9",
  ink: "#1d1915",
  muted: "#6d665e",
  line: "#e5ddd2",
  copper: "#c4622d",
};

export function Button({ label, onPress, tone = "solid", large = false }: { label: string; onPress: () => void; tone?: "solid" | "ghost"; large?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.button, large && styles.large, tone === "ghost" && styles.ghost]}>
      <Text style={[styles.buttonText, large && styles.largeText, tone === "ghost" && styles.ghostText]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ gap: 4, flexGrow: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...rest} style={styles.input} />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.sea, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, alignSelf: "flex-start" },
  large: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, justifyContent: "center" },
  largeText: { fontSize: 16 },
  ghost: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  buttonText: { color: "white", fontWeight: "600" },
  ghostText: { color: colors.ink },
  label: { color: colors.muted, fontSize: 12 },
  input: { backgroundColor: "white", borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: colors.ink },
  card: { backgroundColor: colors.paper, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8 },
});
