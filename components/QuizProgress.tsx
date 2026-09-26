import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../lib/themeContext";

export type QuestionOutcome = "correct" | "incorrect" | null;

/** Segmented progress: one segment per question, coloured by the real outcome. */
export function QuizProgress({ outcomes, index }: { outcomes: QuestionOutcome[]; index: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Avanzamento quiz"
      accessibilityValue={{ min: 0, max: outcomes.length, now: index + 1, text: `Domanda ${index + 1} di ${outcomes.length}` }}
    >
      {outcomes.map((o, i) => (
        <View
          key={i}
          style={[
            styles.seg,
            {
              backgroundColor:
                o === "correct" ? colors.success : o === "incorrect" ? colors.danger : i === index ? colors.accent : colors.fill,
              opacity: o == null && i === index ? 0.55 : 1,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4, flex: 1 },
  seg: { flex: 1, height: 5, borderRadius: 3 },
});
