import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { PhotoImage } from "../components/PhotoImage";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarHeight } from "../lib/useTabBarHeight";
import DemoBadge from "../components/DemoBadge";
import EmptyState from "../components/EmptyState";
import ScreenHeader from "../components/ScreenHeader";
import SettingsButton from "../components/SettingsButton";
import FocusablePressable from "../components/FocusablePressable";
import { QuizModeCard } from "../components/QuizModeCard";
import { QuizProgress, QuestionOutcome } from "../components/QuizProgress";
import { GuessMap, LatLon } from "../components/GuessMap";
import { Palette, radius, spacing, type } from "../lib/theme";
import { useTheme } from "../lib/themeContext";
import { useAppState } from "../lib/appState";
import { buildQuizSession, eligibleFor, PLACE_CORRECT_POINTS, scorePlaceGuess, scoreYearGuess, TARGET_SESSION_LENGTH } from "../lib/quiz/engine";
import { isValidCoordinate } from "../lib/geo/haversine";
import { nearestCity } from "../lib/geo/cityIndex";
import { tapFeedback, successFeedback, impactFeedback } from "../lib/haptics";
import { PhotoAsset, PhotoOverride, QuizQuestion, QuizSessionRecord } from "../lib/types";

type Mode = "place" | "year" | null;
type Feedback = { tone: "good" | "close" | "miss"; title: string; detail: string; gained: number };

function answerCoordinate(p: PhotoAsset | null, ov: PhotoOverride | undefined): LatLon | null {
  if (!p) return null;
  if (isValidCoordinate(p.latitude, p.longitude)) return { latitude: p.latitude as number, longitude: p.longitude as number };
  if (ov && isValidCoordinate(ov.manualLatitude, ov.manualLongitude)) return { latitude: ov.manualLatitude as number, longitude: ov.manualLongitude as number };
  return null;
}

export default function QuizScreen() {
  const insets = useSafeAreaInsets();
  // The tab bar is translucent and overlays the screen: keep the primary actions above it.
  const tabBarH = useTabBarHeight();
  const { width, height } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const { colors, shadow } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { mode, photos, overrides, saveQuizSession, saveQuizQuestion, getActiveQuizSession, listQuizQuestions } = useAppState();

  const [quizMode, setQuizMode] = useState<Mode>(null);
  const [session, setSession] = useState<QuizQuestion[]>([]);
  const [outcomes, setOutcomes] = useState<QuestionOutcome[]>([]);
  const [index, setIndex] = useState(0);
  const [points, setPoints] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [guess, setGuess] = useState<LatLon | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resumeAvailable, setResumeAvailable] = useState<QuizSessionRecord | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const createdAtRef = useRef<number>(Date.now());
  /** The in-flight answer save. Awaited before any later session write, so an
   * `in_progress` save can never land after (and overwrite) `completed`. */
  const pendingSaveRef = useRef<Promise<void> | null>(null);

  const photoById = useMemo(() => Object.fromEntries(photos.map((p) => [p.id, p])), [photos]);
  const placePool = useMemo(() => eligibleFor("place", photos, overrides), [photos, overrides]);
  const yearPool = useMemo(() => eligibleFor("year", photos, overrides), [photos, overrides]);

  // Only reads a session that was genuinely saved in_progress — never invents progress.
  useEffect(() => {
    let alive = true;
    getActiveQuizSession()
      .then((active) => {
        if (alive && active) setResumeAvailable(active);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [getActiveQuizSession]);

  const resetQuestion = () => {
    setAnswered(false);
    setPicked(null);
    setGuess(null);
    setFeedback(null);
  };

  const resumeSession = async () => {
    if (!resumeAvailable) return;
    try {
      const records = await listQuizQuestions(resumeAvailable.id);
      const rebuilt: QuizQuestion[] = records.map((r) => ({ photoId: r.photoId, kind: r.kind, choices: r.choices ?? undefined, correctIndex: r.correctIndex ?? undefined }));
      setQuizMode(resumeAvailable.mode);
      setSession(rebuilt);
      setOutcomes(records.map((r) => r.outcome));
      setSessionId(resumeAvailable.id);
      createdAtRef.current = resumeAvailable.createdAt;
      const firstOpen = records.findIndex((r) => r.outcome == null);
      if (records.length === 0 || firstOpen < 0) {
        // Every question was already answered: this game is finished, not resumable.
        // Close it instead of replaying the last question (which re-adds its points).
        await saveQuizSession({ ...resumeAvailable, status: "completed", completedAt: resumeAvailable.completedAt ?? Date.now() });
        setResumeAvailable(null);
        setSaveError("Quella partita era già conclusa: puoi iniziarne una nuova.");
        return;
      }
      setIndex(firstOpen >= 0 ? firstOpen : Math.min(resumeAvailable.questionIndex, Math.max(rebuilt.length - 1, 0)));
      setPoints(resumeAvailable.score);
      resetQuestion();
      setResumeAvailable(null);
    } catch (e: any) {
      setSaveError(`Impossibile riprendere la sessione: ${e?.message ?? "errore sconosciuto"}`);
    }
  };

  const discardResumable = async () => {
    try {
      if (resumeAvailable) await saveQuizSession({ ...resumeAvailable, status: "completed", completedAt: Date.now() });
      setResumeAvailable(null);
    } catch (e: any) {
      setSaveError(`Impossibile scartare la sessione: ${e?.message ?? "errore sconosciuto"}`);
    }
  };

  const start = async (m: "place" | "year") => {
    tapFeedback();
    const id = `quiz-${Date.now()}`;
    const built = buildQuizSession(m, photos, overrides, id);
    createdAtRef.current = Date.now();
    setQuizMode(m);
    setSession(built);
    setOutcomes(built.map(() => null));
    setSessionId(id);
    setIndex(0);
    setPoints(0);
    resetQuestion();
    setResumeAvailable(null);
    setSaveError(null);
    pendingSaveRef.current = null;
    if (built.length === 0) return;
    try {
      await saveQuizSession({ id, mode: m, seed: id, status: "in_progress", questionIndex: 0, score: 0, createdAt: createdAtRef.current, completedAt: null });
      for (const q of built) {
        await saveQuizQuestion({ sessionId: id, photoId: q.photoId, kind: q.kind, choices: q.choices ?? null, correctIndex: q.correctIndex ?? null, givenIndex: null, outcome: null });
      }
    } catch (e: any) {
      setSaveError(`La partita non verrà salvata: ${e?.message ?? "errore di archiviazione"}`);
    }
  };

  const current = session[index];
  const currentPhoto = current ? photoById[current.photoId] ?? null : null;
  const answerPoint = current?.kind === "place" ? answerCoordinate(currentPhoto, overrides[current.photoId]) : null;

  const persistAnswer = (givenIndex: number, correct: boolean, newPoints: number) => {
    const previous = pendingSaveRef.current ?? Promise.resolve();
    const p = previous.then(() => writeAnswer(givenIndex, correct, newPoints));
    pendingSaveRef.current = p;
    return p;
  };

  const waitForPendingSave = async () => {
    const p = pendingSaveRef.current;
    if (p) await p.catch(() => {});
  };

  const writeAnswer = async (givenIndex: number, correct: boolean, newPoints: number) => {
    if (!sessionId || !current) return;
    try {
      await saveQuizQuestion({
        sessionId,
        photoId: current.photoId,
        kind: current.kind,
        choices: current.choices ?? null,
        correctIndex: current.correctIndex ?? null,
        givenIndex,
        outcome: correct ? "correct" : "incorrect",
      });
      await saveQuizSession({
        id: sessionId,
        mode: quizMode as "place" | "year",
        seed: sessionId,
        status: "in_progress",
        questionIndex: index + 1,
        score: newPoints,
        createdAt: createdAtRef.current,
        completedAt: null,
      });
    } catch (e: any) {
      setSaveError(`Risposta non salvata: ${e?.message ?? "errore di archiviazione"}`);
    }
  };

  const markOutcome = (correct: boolean) => setOutcomes((o) => o.map((v, i) => (i === index ? (correct ? "correct" : "incorrect") : v)));

  const answerYear = (choiceIndex: number) => {
    if (!current || answered) return;
    const correct = choiceIndex === current.correctIndex;
    const gained = scoreYearGuess(correct);
    const newPoints = points + gained;
    setPicked(choiceIndex);
    setPoints(newPoints);
    setAnswered(true);
    markOutcome(correct);
    correct ? successFeedback() : impactFeedback();
    setFeedback(
      correct
        ? { tone: "good", title: "Esatto", detail: `Era proprio il ${current.choices?.[choiceIndex]}.`, gained }
        : { tone: "miss", title: "Non era quello", detail: `La foto è del ${current.choices?.[current.correctIndex ?? 0]}.`, gained },
    );
    persistAnswer(choiceIndex, correct, newPoints);
  };

  const confirmPlace = () => {
    if (!current || answered || !guess || !answerPoint) return;
    const { distanceKm, points: gained } = scorePlaceGuess(guess.latitude, guess.longitude, answerPoint.latitude, answerPoint.longitude);
    const newPoints = points + gained;
    const correct = gained >= PLACE_CORRECT_POINTS;
    const city = nearestCity(answerPoint.latitude, answerPoint.longitude);
    const where = city ? `Scattata vicino a ${city.name}` : "Scattata in un luogo senza nome";
    const km = distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm).toLocaleString("it-IT");
    setPoints(newPoints);
    setAnswered(true);
    markOutcome(correct);
    correct ? successFeedback() : impactFeedback();
    setFeedback({
      tone: correct ? "good" : gained >= 100 ? "close" : "miss",
      title: correct ? "Ottima memoria" : gained >= 100 ? "Ci sei vicino" : "Un po' lontano",
      detail: `${where} · a ${km} km dal tuo segnaposto`,
      gained,
    });
    persistAnswer(0, correct, newPoints);
  };

  const next = async () => {
    tapFeedback();
    await waitForPendingSave();
    if (index + 1 >= session.length) {
      if (sessionId) {
        try {
          await saveQuizSession({ id: sessionId, mode: quizMode as "place" | "year", seed: sessionId, status: "completed", questionIndex: index, score: points, createdAt: createdAtRef.current, completedAt: Date.now() });
        } catch {
          // The result is still shown; only the history entry is missing.
        }
      }
      navigation.navigate("QuizResult", { points, maxPoints: session.length * 1000, coverPhotoId: session[0]?.photoId ?? null });
      setQuizMode(null);
      return;
    }
    setIndex((i) => i + 1);
    resetQuestion();
  };

  const exitQuiz = async () => {
    tapFeedback();
    await waitForPendingSave();
    if (sessionId && quizMode && session.length > 0) {
      if (outcomes.some((o) => o == null)) {
        // Still has open questions: stays in_progress in storage and is offered for resume.
        setResumeAvailable({ id: sessionId, mode: quizMode, seed: sessionId, status: "in_progress", questionIndex: answered ? index + 1 : index, score: points, createdAt: createdAtRef.current, completedAt: null });
      } else {
        // Last question answered, then exited: the game is over. Close it so it can't
        // be resumed and scored twice.
        try {
          await saveQuizSession({ id: sessionId, mode: quizMode, seed: sessionId, status: "completed", questionIndex: session.length - 1, score: points, createdAt: createdAtRef.current, completedAt: Date.now() });
        } catch (e: any) {
          setSaveError(`Partita non chiusa correttamente: ${e?.message ?? "errore di archiviazione"}`);
        }
        setResumeAvailable(null);
      }
    }
    setQuizMode(null);
  };

  // ------------------------------------------------------------------ Home
  if (!quizMode) {
    const wide = width >= 700;
    const placeReason = placePool.length === 0 ? "Servono foto con una posizione." : null;
    const yearReason = yearPool.length === 0 ? "Servono foto con una data nota." : null;
    const placeCover = placePool[0]?.uri ?? null;
    const yearCover = (yearPool.find((p) => p.id !== placePool[0]?.id) ?? yearPool[0])?.uri ?? null;
    const q = (n: number) => `${Math.min(n, TARGET_SESSION_LENGTH)} domande`;
    return (
      <View style={[s.root, { paddingTop: insets.top + spacing.sm }]}>
        <ScreenHeader
          title="Gioca"
          subtitle="Quanto ricordi dei tuoi viaggi?"
          right={
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              {mode === "demo" && <DemoBadge />}
              <SettingsButton />
            </View>
          }
        />
        <View style={[s.homeBody, wide && s.homeBodyWide, { paddingBottom: tabBarH + spacing.md }]}>
          {saveError && <Text style={s.errorText}>{saveError}</Text>}
          {resumeAvailable && (
            <View style={[s.resumeCard, shadow.card]}>
              <View style={s.resumeIcon}>
                <Ionicons name="play" size={16} color={colors.accent} style={{ marginLeft: 2 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.resumeTitle}>Partita in sospeso</Text>
                <Text style={s.resumeSub}>
                  {resumeAvailable.mode === "place" ? "Dove l'hai scattata?" : "Di che anno è?"} · {resumeAvailable.score} punti
                </Text>
              </View>
              <FocusablePressable onPress={discardResumable} accessibilityRole="button" accessibilityLabel="Scarta partita in sospeso" style={s.textBtn}>
                <Text style={s.textBtnMuted}>Scarta</Text>
              </FocusablePressable>
              <FocusablePressable onPress={resumeSession} accessibilityRole="button" accessibilityLabel="Riprendi partita" style={s.resumeCta}>
                <Text style={s.resumeCtaText}>Riprendi</Text>
              </FocusablePressable>
            </View>
          )}
          <View style={[s.modes, wide && { flexDirection: "row" }]}>
            <View style={s.modeSlot}>
              <QuizModeCard
                icon="location"
                title="Dove l'hai scattata?"
                desc="Metti un segnaposto sulla mappa. Più sei vicino, più punti."
                coverUri={placeCover}
                meta={q(placePool.length)}
                disabledReason={placeReason}
                onPress={() => start("place")}
              />
            </View>
            <View style={s.modeSlot}>
              <QuizModeCard
                icon="calendar"
                title="Di che anno è?"
                desc="Quattro anni, una sola risposta giusta."
                coverUri={yearCover}
                meta={q(yearPool.length)}
                disabledReason={yearReason}
                onPress={() => start("year")}
              />
            </View>
          </View>
          <View style={s.note}>
            <Ionicons name="lock-closed" size={13} color={colors.mutedText} />
            <Text style={s.noteText}>Solo sul dispositivo. Nessuna classifica pubblica.</Text>
          </View>
        </View>
      </View>
    );
  }

  // ------------------------------------------------------------------ Empty
  if (session.length === 0) {
    return (
      <View style={[s.root, { paddingTop: insets.top + spacing.sm }]}>
        <EmptyState
          icon="images-outline"
          title="Non ci sono abbastanza foto"
          message={quizMode === "place" ? "Servono foto con una posizione per questa modalità." : "Servono foto con una data nota."}
        />
        <FocusablePressable style={[s.backLink, { marginBottom: tabBarH + spacing.lg }]} onPress={() => setQuizMode(null)} accessibilityRole="button">
          <Text style={s.backLinkText}>Torna alle modalità</Text>
        </FocusablePressable>
      </View>
    );
  }

  // ------------------------------------------------------------------ Play
  const isPlace = quizMode === "place";
  const photoH = isPlace ? Math.max(130, Math.min(240, height * 0.26)) : undefined;
  const toneColor = feedback?.tone === "good" ? colors.success : feedback?.tone === "close" ? colors.warn : colors.danger;
  const toneIcon: keyof typeof Ionicons.glyphMap = feedback?.tone === "good" ? "checkmark" : feedback?.tone === "close" ? "navigate" : "close";

  return (
    <View style={[s.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={[s.play, width >= 700 && s.playWide, { paddingBottom: tabBarH + spacing.md }]}>
        <View style={s.topBar}>
          <FocusablePressable onPress={exitQuiz} accessibilityRole="button" accessibilityLabel="Esci dalla partita" accessibilityHint="La partita resta salvata e potrai riprenderla" style={[s.closeBtn, { backgroundColor: colors.surface }]}>
            <Ionicons name="close" size={20} color={colors.text} />
          </FocusablePressable>
          <QuizProgress outcomes={outcomes} index={index} />
          <View style={s.scorePill}>
            <Text style={s.scorePillText}>{points}</Text>
          </View>
        </View>

        <Text style={s.kicker}>
          DOMANDA {index + 1} DI {session.length}
        </Text>
        <Text style={s.question}>{isPlace ? "Dove l'hai scattata?" : "Di che anno è?"}</Text>
        {saveError && <Text style={s.errorText}>{saveError}</Text>}

        <View style={[s.photoWrap, shadow.card, isPlace ? { height: photoH } : { flex: 1 }]}>
          {currentPhoto ? (
            <PhotoImage uri={currentPhoto.uri} style={StyleSheet.absoluteFill} transition={180} accessibilityLabel="Foto della domanda" showFailureLabel />
          ) : (
            <View style={s.missing}>
              <Ionicons name="image-outline" size={28} color={colors.mutedText} />
              <Text style={s.missingText}>Questa foto non è più disponibile nella libreria.</Text>
            </View>
          )}
        </View>

        {isPlace && (
          <View style={[s.mapArea, shadow.card]}>
            {answerPoint ? (
              <GuessMap guess={guess} onGuessChange={setGuess} answer={answered ? answerPoint : null} />
            ) : (
              <EmptyState icon="alert-circle-outline" title="Posizione non disponibile" message="Questa foto non ha più una posizione. Passa alla prossima." />
            )}
            {!answered && answerPoint && !guess && (
              <View style={s.hint} pointerEvents="none">
                <Ionicons name="hand-left-outline" size={14} color="#FFFFFF" />
                <Text style={s.hintText}>Tocca la mappa per mettere il segnaposto</Text>
              </View>
            )}
          </View>
        )}

        {!isPlace && current?.choices && (
          <View style={s.choices}>
            {current.choices.map((year, i) => {
              const isCorrect = answered && i === current.correctIndex;
              const isWrongPick = answered && i === picked && !isCorrect;
              return (
                <FocusablePressable
                  key={i}
                  disabled={answered}
                  onPress={() => answerYear(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Anno ${year}`}
                  accessibilityState={{ disabled: answered, selected: i === picked }}
                  style={({ pressed, hovered }: any) => [
                    s.choice,
                    shadow.card,
                    (pressed || hovered) && !answered && { backgroundColor: colors.accentSoft },
                    isCorrect && { backgroundColor: colors.success },
                    isWrongPick && { backgroundColor: colors.danger },
                    answered && !isCorrect && !isWrongPick && { opacity: 0.5 },
                  ]}
                >
                  <Text style={[s.choiceText, (isCorrect || isWrongPick) && { color: "#FFFFFF" }]}>{year}</Text>
                </FocusablePressable>
              );
            })}
          </View>
        )}

        <View style={s.footer}>
          {feedback ? (
            <View style={[s.feedbackCard, shadow.raised]}>
              <View style={s.feedbackRow}>
                <View style={[s.feedbackIcon, { backgroundColor: toneColor }]}>
                  <Ionicons name={toneIcon} size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.feedbackTitle}>{feedback.title}</Text>
                  <Text style={s.feedbackDetail} numberOfLines={2}>
                    {feedback.detail}
                  </Text>
                </View>
                <Text style={[s.gained, { color: feedback.gained > 0 ? colors.accent : colors.mutedText }]}>+{feedback.gained}</Text>
              </View>
              <FocusablePressable onPress={next} accessibilityRole="button" style={({ pressed }: any) => [s.primary, pressed && { transform: [{ scale: 0.98 }] }]}>
                <Text style={s.primaryText}>{index + 1 >= session.length ? "Vedi il risultato" : "Prossima domanda"}</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
              </FocusablePressable>
            </View>
          ) : isPlace ? (
            answerPoint ? (
              <FocusablePressable
                onPress={confirmPlace}
                disabled={!guess}
                accessibilityRole="button"
                accessibilityState={{ disabled: !guess }}
                style={({ pressed }: any) => [s.primary, !guess && { opacity: 0.4 }, pressed && guess && { transform: [{ scale: 0.98 }] }]}
              >
                <Ionicons name="location" size={18} color={colors.onAccent} />
                <Text style={s.primaryText}>{guess ? "Conferma posizione" : "Metti un segnaposto"}</Text>
              </FocusablePressable>
            ) : (
              <FocusablePressable onPress={next} accessibilityRole="button" style={s.primary}>
                <Text style={s.primaryText}>Salta</Text>
              </FocusablePressable>
            )
          ) : null}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    homeBody: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
    homeBodyWide: { width: "100%", maxWidth: 960, alignSelf: "center" },
    modes: { flex: 1, gap: spacing.md, marginTop: spacing.sm },
    modeSlot: { flex: 1, minHeight: 176 },
    resumeCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surface, borderRadius: radius.lg, paddingVertical: spacing.sm, paddingLeft: spacing.md, paddingRight: spacing.sm },
    resumeIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" },
    resumeTitle: { ...type.subheadStrong, color: c.text },
    resumeSub: { ...type.footnote, color: c.secondaryText },
    textBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
    textBtnMuted: { ...type.subheadStrong, color: c.mutedText },
    resumeCta: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.accent },
    resumeCtaText: { ...type.subheadStrong, color: c.onAccent },
    note: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    noteText: { ...type.footnote, color: c.mutedText },
    errorText: { ...type.footnote, color: c.danger },
    backLink: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
    backLinkText: { ...type.headline, color: c.accent },

    play: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    playWide: { width: "100%", maxWidth: 760, alignSelf: "center" },
    topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
    closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    scorePill: { minWidth: 56, height: 32, borderRadius: radius.pill, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
    scorePillText: { ...type.subheadStrong, color: c.accent, fontVariant: ["tabular-nums"] },
    kicker: { ...type.captionStrong, color: c.mutedText, letterSpacing: 1 },
    question: { ...type.title1, color: c.text, marginBottom: spacing.md },
    photoWrap: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.fill, marginBottom: spacing.md, minHeight: 130 },
    missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
    missingText: { ...type.footnote, color: c.secondaryText, textAlign: "center" },
    mapArea: { flex: 1, minHeight: 200, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surface },
    hint: {
      position: "absolute",
      left: spacing.md,
      bottom: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(0,0,0,0.62)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
    },
    hintText: { ...type.footnoteStrong, color: "#FFFFFF" },
    choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    choice: { flexBasis: "47%", flexGrow: 1, minHeight: 60, borderRadius: radius.md, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
    choiceText: { ...type.title2, color: c.text, fontVariant: ["tabular-nums"] },
    footer: { marginTop: spacing.md },
    feedbackCard: { backgroundColor: c.surfaceElevated, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
    feedbackRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    feedbackIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    feedbackTitle: { ...type.headline, color: c.text },
    feedbackDetail: { ...type.footnote, color: c.secondaryText },
    gained: { ...type.title2, fontVariant: ["tabular-nums"] },
    primary: { flexDirection: "row", gap: spacing.sm, backgroundColor: c.accent, borderRadius: radius.pill, minHeight: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
    primaryText: { ...type.headline, color: c.onAccent },
  });
