import "react-native-get-random-values";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { DarkTheme, DefaultTheme, NavigationContainer, Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { AppStateProvider, useAppState } from "./lib/appState";
import { defineBackgroundScanTask } from "./lib/indexing/backgroundScan";
import { ThemeProvider, useTheme } from "./lib/themeContext";
import { fontFamily, hairline, spacing, type } from "./lib/theme";
import { GlassTabBar } from "./components/GlassTabBar";

import OnboardingScreen from "./screens/OnboardingScreen";
import MapScreen from "./screens/MapScreen";
import MemoriesScreen from "./screens/MemoriesScreen";
import QuizScreen from "./screens/QuizScreen";
import PhotoDetailScreen from "./screens/PhotoDetailScreen";
import NoLocationScreen from "./screens/NoLocationScreen";
import MemoryDetailScreen from "./screens/MemoryDetailScreen";
import PassportScreen from "./screens/PassportScreen";
import QuizResultScreen from "./screens/QuizResultScreen";
import ShareCardScreen from "./screens/ShareCardScreen";
import SettingsScreen from "./screens/SettingsScreen";
import DiagnosticScreen from "./screens/DiagnosticScreen";

// Must run at module scope on every launch: when iOS wakes the app in background to
// continue a scan, no component is mounted yet. No-op on web.
defineBackgroundScanTask();

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/** iOS shows a collapsing large title in the navigation bar; other runtimes fall
 * back to the standard title automatically. */
const iosLargeTitle = Platform.OS === "ios";

function ErrorFallback({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm }}>
      <Ionicons name="alert-circle-outline" size={34} color={colors.danger} />
      <Text style={[type.headline, { color: colors.text, textAlign: "center" }]}>Si è verificato un errore imprevisto.</Text>
      <Text style={[type.footnote, { color: colors.secondaryText, textAlign: "center" }]}>{message}</Text>
    </View>
  );
}

// A render crash anywhere below must produce a VISIBLE, readable error instead of a
// silent blank/stuck screen — otherwise a real bug looks identical to "still loading".
class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[Atlante] root render crash", error);
  }
  render() {
    if (this.state.error) return <ErrorFallback message={String(this.state.error.message ?? this.state.error)} />;
    return this.props.children;
  }
}

function Tabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      // Custom floating glass bar (components/GlassTabBar): it owns its size in every
      // runtime, so each tab is a real 44pt+ target and it clears the home indicator.
      // Tab screens pad their bottom with lib/useTabBarHeight (same TAB_BAR_BASE).
      tabBar={(props: any) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedText,
        tabBarStyle: { position: "absolute" },
      }}
    >
      <Tab.Screen
        name="MapTab"
        component={MapScreen}
        options={{
          title: "Mappa",
          tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? "map" : "map-outline"} color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="MemoriesTab"
        component={MemoriesScreen}
        options={{
          title: "Ricordi",
          tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? "albums" : "albums-outline"} color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="QuizTab"
        component={QuizScreen}
        options={{
          title: "Gioca",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "game-controller" : "game-controller-outline"} color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { onboardingDone } = useAppState();
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        animation: "slide_from_right",
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.accent,
        headerTitleStyle: { ...type.headline, color: colors.text },
        headerLargeTitleStyle: { fontFamily, fontSize: 34, fontWeight: "700" as const, color: colors.text },
        headerLargeStyle: { backgroundColor: colors.background },
        headerBackTitleVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {!onboardingDone ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          <Stack.Screen name="PhotoDetail" component={PhotoDetailScreen} options={{ title: "Foto" }} />
          <Stack.Screen name="NoLocation" component={NoLocationScreen} options={{ title: "Senza posizione", headerLargeTitle: iosLargeTitle }} />
          <Stack.Screen name="MemoryDetail" component={MemoryDetailScreen} options={{ title: "Ricordo" }} />
          <Stack.Screen name="Passport" component={PassportScreen} options={{ title: "Passaporto", headerLargeTitle: iosLargeTitle }} />
          <Stack.Screen name="QuizResult" component={QuizResultScreen} options={{ title: "Risultato" }} />
          <Stack.Screen name="ShareCard" component={ShareCardScreen} options={{ title: "Condividi" }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Impostazioni", headerLargeTitle: iosLargeTitle }} />
          <Stack.Screen name="Diagnostic" component={DiagnosticScreen} options={{ title: "Diagnostica", headerLargeTitle: iosLargeTitle }} />
        </>
      )}
    </Stack.Navigator>
  );
}

// The startup gate lives OUTSIDE NavigationContainer: while the app is still booting
// it shows a labelled loading state (a bare blank/spinner is what made a slow start
// look like "the preview never loads"), and a failed startup step shows a visible
// banner instead of blocking the app.
function AppShell() {
  const { ready, bootError } = useAppState();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const navTheme: Theme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.separator,
      notification: colors.danger,
    },
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, gap: spacing.md }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[type.footnote, { color: colors.secondaryText }]}>Avvio di Atlante…</Text>
        <StatusBar style={isDark ? "light" : "dark"} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {bootError ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderBottomWidth: hairline,
            borderBottomColor: colors.separator,
            paddingHorizontal: spacing.lg,
            // The banner sits above every screen, so it owns the top safe area:
            // without this it renders under the status bar / Dynamic Island.
            paddingTop: insets.top + spacing.sm,
            paddingBottom: spacing.sm,
          }}
        >
          <Text style={[type.caption, { color: colors.warn, fontWeight: "600" }]}>{bootError}</Text>
        </View>
      ) : null}
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
      <StatusBar style={isDark ? "light" : "dark"} />
    </View>
  );
}

function ThemedRoot() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShell />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootErrorBoundary>
          <AppStateProvider>
            <ThemedRoot />
          </AppStateProvider>
        </RootErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
