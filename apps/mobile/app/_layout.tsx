import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#123e3b" },
          headerTintColor: "#f6f1e8",
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: "#f3eee6" },
        }}
      />
    </>
  );
}
