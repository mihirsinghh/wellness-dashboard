import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Flame,
  Shield,
  Check,
  X,
  ArrowLeft,
  CalendarDays,
  ListTodo,
  Dumbbell,
  Wallet,
  BookOpen,
  Home,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabase";

const DAYS = 30;
const HABITS_STORAGE_KEY = "stability-dashboard-habits-v3";
const TASKS_STORAGE_KEY = "stability-dashboard-tasks-v1";
const EXPENSES_STORAGE_KEY = "stability-dashboard-expenses-v1";
const EXPENSE_CATEGORIES_STORAGE_KEY = "stability-dashboard-expense-categories-v1";
const JOURNAL_STORAGE_KEY = "stability-dashboard-journal-v1";
const JOURNAL_FOLDERS_STORAGE_KEY = "stability-dashboard-journal-folders-v1";
const WORKOUT_PLANS_STORAGE_KEY = "stability-dashboard-workout-plans-v1";
const WORKOUT_FOLDERS_STORAGE_KEY = "stability-dashboard-workout-folders-v1";
const DASHBOARD_STATE_TABLE = "user_dashboard_state";
const SAVE_DEBOUNCE_MS = 800;

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayLogIndex(length = DAYS) {
  return Math.max(0, Math.min(new Date().getDate() - 1, length - 1));
}

function getRelativeDateString(daysAgo = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

function formatExpenseDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatLongDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isDateToday(dateString) {
  return dateString === getTodayDateString();
}

function isDateWithinLastDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return date >= start;
}

function buildBinaryHistory(indices = [], monthKey = getMonthKey()) {
  return Array.from({ length: getMonthLengthFromKey(monthKey) }, (_, i) => indices.includes(i));
}

function getDateLabelFromIndex(index) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const date = new Date(start);
  date.setDate(start.getDate() + index);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getShortAxisLabel(index) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const date = new Date(start);
  date.setDate(start.getDate() + index);
  return date.getDate();
}

function getMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthKeyFromOffset(offsetMonths = 0) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offsetMonths);
  return getMonthKey(date);
}

function parseMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

function getMonthLabel(monthKey, short = false) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: short ? "short" : "long",
    year: "numeric",
  });
}

function getDateLabelFromMonthKey(monthKey, index) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const date = new Date(year, monthIndex, 1);
  date.setDate(index + 1);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getCurrentMonthLabel() {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function getMonthLengthFromKey(monthKey) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getHabitStartIndexForMonth(habit, monthKey = getMonthKey()) {
  if (!habit.startDate) return 0;
  const { year, monthIndex } = parseMonthKey(monthKey);
  const startDate = new Date(`${habit.startDate}T00:00:00`);
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex, getMonthLengthFromKey(monthKey));
  const monthLength = getMonthLengthFromKey(monthKey);

  if (startDate > monthEnd) return monthLength;
  if (startDate < monthStart) return 0;
  return Math.max(0, Math.min(startDate.getDate() - 1, monthLength));
}

function createHabitLogsForMonth(type, startDate, monthKey = getMonthKey()) {
  const tempHabit = { startDate };
  const startIndex = getHabitStartIndexForMonth(tempHabit, monthKey);
  return Array.from({ length: getMonthLengthFromKey(monthKey) }, (_, index) => {
    if (index < startIndex) return null;
    return type === "build" ? false : 0;
  });
}

function ensureHabitMonthLogs(habit, monthLogs = [], monthKey = getMonthKey()) {
  const normalizedLogs = Array.isArray(monthLogs) ? monthLogs : [];
  const monthLength = getMonthLengthFromKey(monthKey);
  const startIndex = getHabitStartIndexForMonth(habit, monthKey);
  return Array.from({ length: monthLength }, (_, index) => {
    if (index < startIndex) return null;
    const existingValue = normalizedLogs[index];
    if (existingValue !== undefined) return existingValue;
    return habit.type === "build" ? false : 0;
  });
}

function getJournalPreview(body = "", maxLength = 110) {
  const cleanBody = body.replace(/\s+/g, " ").trim();
  if (!cleanBody) return "Start writing when you are ready.";
  if (cleanBody.length <= maxLength) return cleanBody;
  return `${cleanBody.slice(0, maxLength).trimEnd()}...`;
}

const journalPromptPool = [
  "What emotion asked for most of my attention today, and how did I respond to it?",
  "Where did I feel most like myself today?",
  "What discomfort did I avoid, and what might it be trying to teach me?",
  "What helped me feel steadier than I expected today?",
  "When did I act from fear instead of clarity?",
  "What story about myself felt strongest today, and is it actually true?",
  "What am I carrying right now that I may not need to keep carrying?",
  "Where did I notice self-respect growing in a small way today?",
  "What moment today felt more tender, honest, or alive than the rest?",
  "What pattern keeps repeating in my inner life lately?",
  "What did I need today that I had trouble admitting?",
  "Where was I gentler with myself than I used to be?",
  "What choice today moved me toward the person I want to become?",
  "What drained me today, and what restored me even a little?",
  "If I slowed down and told myself the truth, what would I say?",
  "What am I learning about my needs, limits, or values right now?",
  "What did I judge in myself today, and what sits underneath that judgment?",
  "What would it look like to relate to this season of life with more patience?",
];

function getRandomJournalPrompts(count = 3) {
  const shuffled = [...journalPromptPool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function loadStoredValue(storageKey, fallbackValue, normalizeValue) {
  if (typeof window === "undefined") return fallbackValue;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return fallbackValue;
    const parsed = JSON.parse(stored);
    return normalizeValue ? normalizeValue(parsed) : parsed;
  } catch {
    return fallbackValue;
  }
}

function getHabitHistory(habit) {
  const currentMonthKey = getMonthKey();
  return {
    ...(habit.history ?? {}),
    [currentMonthKey]: habit.history?.[currentMonthKey] ?? habit.logs ?? [],
  };
}

function getHabitYears(habit) {
  return [...new Set(Object.keys(getHabitHistory(habit)).map((key) => Number(key.slice(0, 4))))].sort((a, b) => b - a);
}

function normalizeHabit(habit) {
  const history = getHabitHistory(habit);
  const monthKey = getMonthKey();
  const startDate = habit.startDate ?? null;
  const normalizedHabit = {
    ...habit,
    startDate,
    type: habit.type ?? "build",
  };
  const normalizedHistory = Object.fromEntries(
    Object.entries(history).map(([historyMonthKey, monthLogs]) => [
      historyMonthKey,
      ensureHabitMonthLogs(normalizedHabit, monthLogs, historyMonthKey),
    ]),
  );
  return {
    ...normalizedHabit,
    startDate,
    history: normalizedHistory,
    logs: normalizedHistory[monthKey] ?? createHabitLogsForMonth(normalizedHabit.type, startDate, monthKey),
  };
}

const initialHabits = [];

const initialTasks = [];

const initialExpenses = [];

const initialExpenseCategories = ["General"];

const initialJournalEntries = [];

const initialJournalFolders = [];

const initialWorkoutFolders = [];

const initialWorkoutPlans = [];

const SEEDED_HABIT_IDS = new Set(["meditation", "journal", "exercise", "weed", "icecream", "screen"]);
const SEEDED_TASK_IDS = new Set(["task-1", "task-2", "task-3", "task-4", "task-5"]);
const SEEDED_EXPENSE_IDS = new Set(["exp-1", "exp-2", "exp-3", "exp-4", "exp-5", "exp-6"]);
const SEEDED_JOURNAL_IDS = new Set(["j-1", "j-2"]);
const SEEDED_JOURNAL_FOLDER_IDS = new Set(["folder-reflection", "folder-insights"]);
const SEEDED_JOURNAL_TITLES = new Set(["What reduced suffering today?", "Current insight"]);
const SEEDED_JOURNAL_FOLDER_NAMES = new Set(["Reflections", "Insights"]);
const SEEDED_WORKOUT_IDS = new Set(["workout-upper-a", "workout-lower-a"]);
const SEEDED_WORKOUT_FOLDER_IDS = new Set(["workout-folder-upper-lower", "workout-folder-athletic"]);

function looksLikeSeededDemoData(payload = {}) {
  const habitIds = (payload.habits ?? []).map((habit) => habit.id).sort().join(",");
  const taskIds = (payload.tasks ?? []).map((task) => task.id).sort().join(",");
  const expenseIds = (payload.expenses ?? []).map((expense) => expense.id).sort().join(",");
  const journalIds = (payload.journalEntries ?? []).map((entry) => entry.id).sort().join(",");
  const journalFolderIds = (payload.journalFolders ?? []).map((folder) => folder.id).sort().join(",");
  const workoutIds = (payload.workoutPlans ?? []).map((plan) => plan.id).sort().join(",");
  const workoutFolderIds = (payload.workoutFolders ?? []).map((folder) => folder.id).sort().join(",");

  return (
    habitIds === "exercise,icecream,journal,meditation,screen,weed" &&
    taskIds === "task-1,task-2,task-3,task-4,task-5" &&
    expenseIds === "exp-1,exp-2,exp-3,exp-4,exp-5,exp-6" &&
    journalIds === "j-1,j-2" &&
    journalFolderIds === "folder-insights,folder-reflection" &&
    workoutIds === "workout-lower-a,workout-upper-a" &&
    workoutFolderIds === "workout-folder-athletic,workout-folder-upper-lower"
  );
}

function stripSeededDemoData(payload = {}) {
  const habits = (payload.habits ?? []).filter((habit) => !SEEDED_HABIT_IDS.has(habit.id));
  const tasks = (payload.tasks ?? []).filter((task) => !SEEDED_TASK_IDS.has(task.id));
  const expenses = (payload.expenses ?? []).filter((expense) => !SEEDED_EXPENSE_IDS.has(expense.id));
  const journalEntries = (payload.journalEntries ?? []).filter((entry) => !SEEDED_JOURNAL_IDS.has(entry.id) && !SEEDED_JOURNAL_TITLES.has(entry.title));
  const journalFolders = (payload.journalFolders ?? []).filter((folder) => !SEEDED_JOURNAL_FOLDER_IDS.has(folder.id) && !SEEDED_JOURNAL_FOLDER_NAMES.has(folder.name));
  const workoutPlans = (payload.workoutPlans ?? []).filter((plan) => !SEEDED_WORKOUT_IDS.has(plan.id));
  const workoutFolders = (payload.workoutFolders ?? []).filter((folder) => !SEEDED_WORKOUT_FOLDER_IDS.has(folder.id));

  return {
    ...payload,
    habits,
    tasks,
    expenses,
    expenseCategories: Array.isArray(payload.expenseCategories) && payload.expenseCategories.length ? payload.expenseCategories : initialExpenseCategories,
    journalEntries: journalEntries.map((entry) => (
      SEEDED_JOURNAL_FOLDER_IDS.has(entry.folderId) ? { ...entry, folderId: null } : entry
    )),
    journalFolders,
    workoutPlans: workoutPlans.map((plan) => (
      SEEDED_WORKOUT_FOLDER_IDS.has(plan.folderId) ? { ...plan, folderId: null } : plan
    )),
    workoutFolders,
  };
}

function formatBenefitAmount(amount, unit = "") {
  const rounded = Number.isInteger(amount) ? `${amount}` : amount.toFixed(1);
  return unit.trim() === "$" ? `$${rounded}` : `${rounded}${unit ? ` ${unit}` : ""}`;
}

function getHabitBenefitSummary(habit, successCount = 0) {
  if (!habit.benefit || !habit.benefit.amount || !habit.benefit.unit?.trim()) return null;
  const amount = Number(habit.benefit.amount) || 0;
  const total = amount * successCount;
  const verb = habit.benefit.verb?.trim() || "saved";
  return {
    amount,
    total,
    unit: habit.benefit.unit.trim(),
    verb,
    perSuccessLabel: `${formatBenefitAmount(amount, habit.benefit.unit)} ${verb} per successful ${habit.target.period}`,
    totalLabel: `${formatBenefitAmount(total, habit.benefit.unit)} ${verb} this month`,
  };
}
function getDefaultDashboardState() {
  return {
    habits: initialHabits.map(normalizeHabit),
    tasks: initialTasks,
    expenses: initialExpenses,
    expenseCategories: initialExpenseCategories,
    journalEntries: normalizeJournalEntries(initialJournalEntries),
    journalFolders: normalizeJournalFolders(initialJournalFolders),
    workoutPlans: normalizeWorkoutPlans(initialWorkoutPlans),
    workoutFolders: normalizeWorkoutFolders(initialWorkoutFolders),
  };
}

function normalizeDashboardState(payload = {}) {
  const defaults = getDefaultDashboardState();
  if (looksLikeSeededDemoData(payload)) return defaults;
  const cleanedPayload = stripSeededDemoData(payload);
  return {
    habits: Array.isArray(cleanedPayload.habits) ? cleanedPayload.habits.map(normalizeHabit) : defaults.habits,
    tasks: Array.isArray(cleanedPayload.tasks) ? cleanedPayload.tasks : defaults.tasks,
    expenses: Array.isArray(cleanedPayload.expenses) ? cleanedPayload.expenses : defaults.expenses,
    expenseCategories: Array.isArray(cleanedPayload.expenseCategories) ? cleanedPayload.expenseCategories : defaults.expenseCategories,
    journalEntries: Array.isArray(cleanedPayload.journalEntries) ? normalizeJournalEntries(cleanedPayload.journalEntries) : defaults.journalEntries,
    journalFolders: Array.isArray(cleanedPayload.journalFolders) ? normalizeJournalFolders(cleanedPayload.journalFolders) : defaults.journalFolders,
    workoutPlans: Array.isArray(cleanedPayload.workoutPlans) ? normalizeWorkoutPlans(cleanedPayload.workoutPlans) : defaults.workoutPlans,
    workoutFolders: Array.isArray(cleanedPayload.workoutFolders) ? normalizeWorkoutFolders(cleanedPayload.workoutFolders) : defaults.workoutFolders,
  };
}

function loadLocalDashboardState() {
  return normalizeDashboardState({
    habits: loadStoredValue(HABITS_STORAGE_KEY, initialHabits.map(normalizeHabit), (stored) => stored.map(normalizeHabit)),
    tasks: loadStoredValue(TASKS_STORAGE_KEY, initialTasks),
    expenses: loadStoredValue(EXPENSES_STORAGE_KEY, initialExpenses),
    expenseCategories: loadStoredValue(EXPENSE_CATEGORIES_STORAGE_KEY, initialExpenseCategories),
    journalEntries: loadStoredValue(JOURNAL_STORAGE_KEY, normalizeJournalEntries(initialJournalEntries), (stored) => normalizeJournalEntries(stored)),
    journalFolders: loadStoredValue(JOURNAL_FOLDERS_STORAGE_KEY, normalizeJournalFolders(initialJournalFolders), (stored) => normalizeJournalFolders(stored)),
    workoutPlans: loadStoredValue(WORKOUT_PLANS_STORAGE_KEY, normalizeWorkoutPlans(initialWorkoutPlans), (stored) => normalizeWorkoutPlans(stored)),
    workoutFolders: loadStoredValue(WORKOUT_FOLDERS_STORAGE_KEY, normalizeWorkoutFolders(initialWorkoutFolders), (stored) => normalizeWorkoutFolders(stored)),
  });
}

function persistLocalDashboardState(snapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HABITS_STORAGE_KEY, JSON.stringify(snapshot.habits));
  window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(snapshot.tasks));
  window.localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(snapshot.expenses));
  window.localStorage.setItem(EXPENSE_CATEGORIES_STORAGE_KEY, JSON.stringify(snapshot.expenseCategories));
  window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(snapshot.journalEntries));
  window.localStorage.setItem(JOURNAL_FOLDERS_STORAGE_KEY, JSON.stringify(snapshot.journalFolders));
  window.localStorage.setItem(WORKOUT_PLANS_STORAGE_KEY, JSON.stringify(snapshot.workoutPlans));
  window.localStorage.setItem(WORKOUT_FOLDERS_STORAGE_KEY, JSON.stringify(snapshot.workoutFolders));
}

const palette = {
  emerald: {
    text: "text-emerald-600",
    pill: "bg-emerald-100",
    button: "bg-emerald-500 hover:bg-emerald-600",
    stroke: "#10b981",
  },
  amber: {
    text: "text-amber-500",
    pill: "bg-amber-100",
    button: "bg-amber-500 hover:bg-amber-600",
    stroke: "#f59e0b",
  },
};

function chunkByPeriod(logs, period) {
  if (period === "week") {
    const chunks = [];
    for (let i = 0; i < logs.length; i += 7) chunks.push(logs.slice(i, i + 7));
    return chunks;
  }
  if (period === "month") return [logs];
  return logs.map((value) => [value]);
}

function getCurrentStreak(items) {
  let count = 0;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (!items[i]) break;
    count += 1;
  }
  return count;
}

function getBestStreak(items) {
  let best = 0;
  let running = 0;
  items.forEach((ok) => {
    if (ok) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 0;
    }
  });
  return best;
}

function buildConsecutiveChart(points, axisMode = "days") {
  let streak = 0;
  return points.map((point, idx) => {
    const success = typeof point === "object" ? point.success : point;
    const calendarIndex = typeof point === "object" && point.index !== undefined ? point.index : idx;
    streak = success ? streak + 1 : 0;
    return {
      day: calendarIndex + 1,
      value: streak,
      success,
      dateLabel:
        axisMode === "days"
          ? getDateLabelFromIndex(calendarIndex)
          : `${axisMode === "weeks" ? "Week" : "Month"} ${idx + 1}`,
    };
  });
}

function formatStreakLabel(count, unit) {
  return `${count} ${unit}${count === 1 ? "" : "s"} streak`;
}

function getVisibleMonthLogEntries(habit, monthKey = getMonthKey()) {
  const history = getHabitHistory(habit);
  const monthLogs = history[monthKey] ?? habit.logs ?? [];
  const isCurrentMonth = monthKey === getMonthKey();
  const visibleCount = isCurrentMonth ? Math.min(new Date().getDate(), monthLogs.length) : monthLogs.length;
  const startIndex = getHabitStartIndexForMonth(habit, monthKey);
  return monthLogs
    .slice(startIndex, visibleCount)
    .map((value, offset) => ({ index: startIndex + offset, value }))
    .filter((entry) => entry.value !== null && entry.value !== undefined);
}

function getBuildValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  return Number(value) || 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getCurrentMonthVisibility(monthKey = getMonthKey(), monthLogsLength = DAYS) {
  const isCurrentMonth = monthKey === getMonthKey();
  return {
    isCurrentMonth,
    visibleCount: isCurrentMonth ? Math.min(new Date().getDate(), monthLogsLength) : monthLogsLength,
    todayIndex: isCurrentMonth ? getTodayLogIndex(monthLogsLength) : -1,
  };
}

function getBuildDayState(habit, rawValue, index, monthKey = getMonthKey()) {
  const value = getBuildValue(rawValue);
  const target = Math.max(1, Number(habit.target.frequency) || 1);
  const { todayIndex } = getCurrentMonthVisibility(monthKey);
  const isCurrentDay = index === todayIndex;
  const fill = clamp(value / target, 0, 1);

  if (value >= target) {
    return {
      status: "success",
      fill,
      success: true,
      finalized: true,
      value,
    };
  }

  if (isCurrentDay) {
    return {
      status: value > 0 ? "partial" : "pending",
      fill,
      success: false,
      finalized: false,
      value,
    };
  }

  return {
    status: "failed",
    fill,
    success: false,
    finalized: true,
    value,
  };
}

function getReducePeriodState(total, limit, isCurrentPeriod) {
  if (total > limit) {
    return {
      status: "failed",
      fill: 1,
      success: false,
      finalized: true,
      total,
    };
  }

  if (isCurrentPeriod) {
    return {
      status: "pending",
      fill: 0,
      success: false,
      finalized: false,
      total,
    };
  }

  return {
    status: "success",
    fill: 1,
    success: true,
    finalized: true,
    total,
  };
}

function getBuildMetrics(habit) {
  const visibleLogs = getVisibleMonthLogEntries(habit);
  const dayStates = visibleLogs.map((entry) => ({
    index: entry.index,
    ...getBuildDayState(habit, entry.value, entry.index),
  }));
  const finalizedStates = dayStates.filter((entry) => entry.finalized);
  const successes = finalizedStates.map((entry) => entry.success);
  const recent7 = finalizedStates.slice(-7).filter((entry) => entry.success).length;
  const totalSuccessful = finalizedStates.filter((entry) => entry.success).length;
  const currentStreak = getCurrentStreak(successes);
  const bestStreak = getBestStreak(successes);
  const todayValue = dayStates[dayStates.length - 1]?.value ?? 0;
  const todayStatus = dayStates[dayStates.length - 1]?.status ?? "pending";

  return {
    currentStreak,
    bestStreak,
    consistency7: Math.round((recent7 / Math.min(7, Math.max(finalizedStates.length, 1))) * 100),
    consistency30: Math.round((totalSuccessful / Math.max(finalizedStates.length, 1)) * 100),
    completedToday: todayStatus === "success",
    chartData: buildConsecutiveChart(finalizedStates.map((entry) => ({ index: entry.index, success: entry.success })), "days"),
    summaryValue: formatStreakLabel(currentStreak, "day"),
    totalSuccessful,
    todayValue,
    todayStatus,
    chartXAxisMode: "days",
    chartSummaryLabel: `${totalSuccessful} successful days this month`,
    periodSuccesses: recent7,
    periodSummaryLabel: "Successful days this week",
  };
}

function getReduceMetrics(habit) {
  const { frequency, period, label } = habit.target;
  const visibleLogEntries = getVisibleMonthLogEntries(habit);
  const visibleLogs = visibleLogEntries.map((entry) => entry.value);
  const grouped = chunkByPeriod(visibleLogs, period);
  const currentPeriodIndex = Math.max(0, grouped.length - 1);
  const periodStates = grouped.map((chunk, index) => {
    const total = chunk.reduce((sum, value) => sum + value, 0);
    const state = getReducePeriodState(total, frequency, index === currentPeriodIndex);
    return { ...state, index };
  });
  const finalizedStates = periodStates.filter((entry) => entry.finalized);
  const compliant = finalizedStates.map((entry) => entry.success);
  const totalSuccessful = finalizedStates.filter((entry) => entry.success).length;
  const recent7 = finalizedStates.slice(-7).filter((entry) => entry.success).length;
  const currentStreak = getCurrentStreak(compliant);
  const bestStreak = getBestStreak(compliant);
  const axisMode = period === "week" ? "weeks" : period === "month" ? "months" : "days";
  const streakUnit = period === "week" ? "week" : period === "month" ? "month" : "day";
  const chartSource = period === "day"
    ? visibleLogEntries
      .map((entry) => ({
        index: entry.index,
        ...getReducePeriodState(entry.value, frequency, entry.index === getTodayLogIndex(habit.logs.length)),
      }))
      .filter((entry) => entry.finalized)
      .map((entry) => ({
        index: entry.index,
        success: entry.success,
      }))
    : periodStates
      .filter((entry) => entry.finalized)
      .map((entry) => entry.success);
  const currentPeriodState = periodStates[currentPeriodIndex] ?? { status: "pending" };

  return {
    currentStreak,
    bestStreak,
    consistency7: Math.round((recent7 / Math.min(7, Math.max(finalizedStates.length, 1))) * 100),
    consistency30: Math.round((totalSuccessful / Math.max(finalizedStates.length, 1)) * 100),
    completedToday: currentPeriodState.status === "success",
    chartData: buildConsecutiveChart(chartSource, axisMode),
    summaryValue: formatStreakLabel(currentStreak, streakUnit),
    targetLabel: label,
    totalSuccessful,
    todayStatus: currentPeriodState.status,
    chartXAxisMode: axisMode,
    chartSummaryLabel: `${totalSuccessful} successful ${period === "week" ? "weeks" : period === "month" ? "months" : "days"} this month`,
    periodSuccesses: grouped[grouped.length - 1]?.reduce((sum, value) => sum + value, 0) ?? 0,
    periodSummaryLabel: period === "week" ? "Uses this week" : period === "month" ? "Uses this month" : "Uses today",
  };
}

function getHabitMetrics(habit) {
  return habit.type === "build" ? getBuildMetrics(habit) : getReduceMetrics(habit);
}

function getHabitCubeData(habit, monthKey = getMonthKey()) {
  const history = getHabitHistory(habit);
  const monthLogs = history[monthKey] ?? [];
  const { todayIndex, visibleCount } = getCurrentMonthVisibility(monthKey, monthLogs.length);
  const visibleLogs = monthLogs.slice(0, visibleCount);
  const startIndex = getHabitStartIndexForMonth(habit, monthKey);

  if (habit.type === "build") {
    return visibleLogs.map((value, index) => ({
      day: index + 1,
      beforeStart: index < startIndex,
      ...(index < startIndex ? { status: "not-started", fill: 0, success: false, level: 0 } : getBuildDayState(habit, value, index, monthKey)),
      dateLabel: getDateLabelFromMonthKey(monthKey, index),
      statusLabel:
        index < startIndex
          ? "tracking not started"
          : (() => {
              const state = getBuildDayState(habit, value, index, monthKey);
              if (state.status === "success") return `${state.value} / ${habit.target.frequency} completed`;
              if (state.status === "partial") return `${state.value} / ${habit.target.frequency} completed so far`;
              if (state.status === "pending") return "not started yet today";
              return `${state.value} / ${habit.target.frequency} completed`;
            })(),
    }));
  }

  const { frequency, period } = habit.target;

  if (period === "day") {
    return visibleLogs.map((value, index) => ({
      day: index + 1,
      beforeStart: index < startIndex,
      ...(index < startIndex ? { status: "not-started", fill: 0, success: false, level: 0 } : getReducePeriodState(value, frequency, index === todayIndex)),
      dateLabel: getDateLabelFromMonthKey(monthKey, index),
      statusLabel:
        index < startIndex
          ? "tracking not started"
          : (() => {
              const state = getReducePeriodState(value, frequency, index === todayIndex);
              if (state.status === "pending") return `${value} / ${frequency} uses so far`;
              return `${value} / ${frequency} uses`;
            })(),
    }));
  }

  if (period === "week") {
    return visibleLogs.map((value, index) => {
      const chunkStart = Math.floor(index / 7) * 7;
      const chunk = visibleLogs.slice(chunkStart, chunkStart + 7);
      const partialChunk = visibleLogs.slice(chunkStart, index + 1);
      const weeklyTotal = chunk.reduce((sum, item) => sum + item, 0);
      const runningTotal = partialChunk.reduce((sum, item) => sum + item, 0);
      const isCurrentWeek = Math.floor(index / 7) === Math.floor(todayIndex / 7) && monthKey === getMonthKey();
      const state = getReducePeriodState(weeklyTotal > frequency ? weeklyTotal : runningTotal, frequency, isCurrentWeek && weeklyTotal <= frequency);
      return {
        day: index + 1,
        beforeStart: index < startIndex,
        ...(index < startIndex ? { status: "not-started", fill: 0, success: false, level: 0 } : state),
        dateLabel: getDateLabelFromMonthKey(monthKey, index),
        statusLabel: index < startIndex ? "tracking not started" : `week total ${runningTotal} / ${frequency}`,
      };
    });
  }

  const monthTotal = visibleLogs.reduce((sum, value) => sum + value, 0);
  const monthState = getReducePeriodState(monthTotal, frequency, monthKey === getMonthKey() && monthTotal <= frequency);
  return visibleLogs.map((_, index) => ({
    day: index + 1,
    beforeStart: index < startIndex,
    ...(index < startIndex ? { status: "not-started", fill: 0, success: false, level: 0 } : monthState),
    dateLabel: getDateLabelFromMonthKey(monthKey, index),
    statusLabel:
      index < startIndex
        ? "tracking not started"
        : monthState.status === "pending"
          ? "within monthly target so far"
          : monthState.status === "success"
            ? "within monthly target"
            : "over monthly target",
  }));
}

function getHabitWeekData(habit, monthKey = getMonthKey()) {
  const history = getHabitHistory(habit);
  const monthLogs = history[monthKey] ?? [];
  const { visibleCount } = getCurrentMonthVisibility(monthKey, monthLogs.length);
  const visibleLogs = monthLogs.slice(0, visibleCount);
  const weeklyChunks = [];

  for (let start = 0; start < visibleLogs.length; start += 7) {
    const chunk = visibleLogs.slice(start, start + 7);
    const total = chunk.reduce((sum, value) => sum + value, 0);
    const end = Math.min(start + chunk.length - 1, monthLogs.length - 1);
    const isCurrentWeek = monthKey === getMonthKey() && end >= getTodayLogIndex(monthLogs.length);
    const state = getReducePeriodState(total, habit.target.frequency, isCurrentWeek);

    weeklyChunks.push({
      week: Math.floor(start / 7) + 1,
      total,
      success: state.success,
      status: state.status,
      startLabel: getDateLabelFromMonthKey(monthKey, start),
      endLabel: getDateLabelFromMonthKey(monthKey, end),
    });
  }

  return weeklyChunks;
}

function getLinePoints(data, width, height, padX = 18, padY = 16) {
  const safeData = data.length > 0 ? data : [{ day: 1, value: 0, success: false, dateLabel: "Day 1" }];
  const maxX = Math.max(...safeData.map((d) => d.day), 1);
  const maxY = Math.max(...safeData.map((d) => d.value), 1);
  return safeData.map((d) => ({
    x: padX + ((d.day - 1) / Math.max(maxX - 1, 1)) * (width - padX * 2),
    y: height - padY - (d.value / maxY) * (height - padY * 2),
    value: d.value,
    day: d.day,
    success: d.success,
    dateLabel: d.dateLabel,
  }));
}

function getXAxisTicks(data, mode) {
  if (mode === "weeks" || mode === "months") return data.map((d) => d.day);
  return [1, 10, 20, 30].filter((tick) => tick <= Math.max(data.length, 1));
}

function getHabitTitleStyle(name = "") {
  const length = name.trim().length;
  const desktopSize = Math.max(10, 26 - Math.max(0, length - 10) * 0.8);
  const mobileSize = Math.max(10, 21 - Math.max(0, length - 10) * 0.65);
  return {
    fontSize: `clamp(${mobileSize}px, ${mobileSize}px + 0.3vw, ${desktopSize}px)`,
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
  };
}

function LineChart({ data, xLabelMode = "days", color = "#10b981", compact = false }) {
  const width = 520;
  const height = 190;
  const leftLabelPad = compact ? 12 : 24;
  const points = getLinePoints(data, width, height);
  const [hovered, setHovered] = useState(null);
  const path = points.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const maxY = Math.max(...(data.length ? data : [{ value: 0 }]).map((d) => d.value), 1);
  const yTicks = Array.from(new Set([0, Math.ceil(maxY / 2), maxY])).sort((a, b) => a - b);
  const xTicks = getXAxisTicks(data, xLabelMode);

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        {!compact ? (
          <div className="flex items-center">
            <span className="-rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Streak
            </span>
          </div>
        ) : null}
        <div className="relative flex-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full overflow-visible">
          {!compact ? <line x1={leftLabelPad} y1="16" x2={leftLabelPad} y2={height - 16} stroke="#a1a1aa" strokeWidth="1.2" /> : null}
          {!compact ? <line x1={leftLabelPad} y1={height - 16} x2={width - 18} y2={height - 16} stroke="#a1a1aa" strokeWidth="1.2" /> : null}
          {!compact ? yTicks.map((tick) => {
            const y = height - 16 - (tick / Math.max(maxY, 1)) * (height - 32);
            return (
              <g key={tick}>
                <line x1={leftLabelPad} y1={y} x2={width - 18} y2={y} stroke="#d4d4d8" strokeWidth="1" />
                <text x="2" y={y + 4} fontSize="11" fill="#a1a1aa">{tick}</text>
              </g>
            );
          }) : null}
          <path d={path} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
          {points.map((p) => (
            <g key={`${p.day}-${p.value}`}>
              <circle cx={p.x} cy={p.y} r="8" fill="transparent" onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)} />
              <circle cx={p.x} cy={p.y} r="4" fill={color} onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)} />
            </g>
          ))}
        </svg>
        {hovered ? (
          <div
            className="pointer-events-none absolute rounded-2xl bg-emerald-950 px-3 py-2 text-sm text-white shadow-xl"
            style={{ left: `${(hovered.x / width) * 100}%`, top: `${(hovered.y / height) * 100 - 18}%`, transform: "translate(-50%, -100%)" }}
          >
            <div className="font-semibold">{hovered.dateLabel}</div>
            <div>{hovered.value} consecutive successful {xLabelMode === "days" ? "days" : xLabelMode === "weeks" ? "weeks" : "months"}</div>
          </div>
        ) : null}
      </div>
      </div>
      {!compact ? (
        <>
          <div className="ml-9 flex items-center justify-between px-1 text-xs text-zinc-500">
            {xTicks.map((tick) => (
              <span key={tick}>{xLabelMode === "weeks" ? `W${tick}` : xLabelMode === "months" ? `M${tick}` : getShortAxisLabel(tick - 1)}</span>
            ))}
          </div>
          <div className="ml-9 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {xLabelMode === "days" ? "Day of month" : xLabelMode === "weeks" ? "Week" : "Month"}
          </div>
        </>
      ) : null}
    </div>
  );
}

function HabitCubeGrid({ habit, compact = false, monthKey = getMonthKey(), headerMode = "full" }) {
  const colors = palette[habit.color];
  const cubes = getHabitCubeData(habit, monthKey);
  const weeklyTiles = habit.type === "reduce" && habit.target.period === "week" ? getHabitWeekData(habit, monthKey) : [];
  const monthLabel = getMonthLabel(monthKey);
  const gapClass = compact ? "gap-1" : "gap-2";
  const squareClass = compact ? "rounded-[0.2rem]" : "rounded-[0.45rem]";
  const innerSquareClass = compact ? "rounded-[0.15rem]" : "rounded-[0.4rem]";

  const getCubeFillClass = (cube) => {
    if (cube.beforeStart) return "bg-transparent";
    if (cube.status === "success") return "bg-emerald-500";
    if (cube.status === "failed") return "bg-rose-500";
    if (cube.status === "partial") return "bg-amber-400";
    return "bg-transparent";
  };

  const getCubeShellClass = (cube) => {
    if (cube.beforeStart) return "border-zinc-200/40 bg-transparent";
    if (cube.status === "success") return habit.type === "reduce" ? "border-transparent bg-emerald-100" : `${colors.pill} border-transparent`;
    if (cube.status === "failed") return "border-transparent bg-rose-100";
    if (cube.status === "partial") return "border-amber-200 bg-amber-50";
    return "border-zinc-200 bg-white";
  };

  return (
    <div className="space-y-3">
      {headerMode !== "none" ? (
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          <span>{monthLabel}</span>
          {headerMode === "full" ? <span>{habit.target.period === "week" ? habit.target.label : "Daily history"}</span> : null}
        </div>
      ) : null}
      {weeklyTiles.length > 0 ? (
        <>
          <div className={`grid ${compact ? "gap-2" : "gap-3"}`}>
            {weeklyTiles.map((tile) => (
              <div
                key={`${habit.id}-${monthKey}-week-${tile.week}`}
                title={`${tile.startLabel} - ${tile.endLabel}: ${tile.total} / ${habit.target.frequency} uses`}
                className={`rounded-[1rem] border px-4 py-3 ${
                  tile.status === "success"
                    ? "border-emerald-300 bg-emerald-100/80"
                    : tile.status === "failed"
                      ? "border-rose-300 bg-rose-100/80"
                      : "border-zinc-300 bg-zinc-100/80"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Week {tile.week}</div>
                    <div className="mt-1 text-sm text-zinc-700">{tile.startLabel} - {tile.endLabel}</div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    tile.status === "success"
                      ? "bg-emerald-500 text-black"
                      : tile.status === "failed"
                        ? "bg-rose-500 text-white"
                        : "bg-zinc-300 text-zinc-700"
                  }`}>
                    {tile.total} / {habit.target.frequency}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{weeklyTiles.length} weekly checks</span>
            <span>{weeklyTiles.filter((tile) => tile.success).length} within target</span>
          </div>
        </>
      ) : (
        <>
          <div className={`grid grid-cols-7 ${gapClass}`}>
            {cubes.map((cube) => (
              <div
                key={`${habit.id}-${cube.day}`}
                title={`${cube.dateLabel}: ${cube.statusLabel}`}
                className={`aspect-square border ${squareClass} ${getCubeShellClass(cube)}`}
              >
                <div
                  className={`h-full w-full ${innerSquareClass} ${getCubeFillClass(cube)}`}
                  style={{
                    opacity: cube.status === "pending" ? 0 : 1,
                    width: `${Math.round((cube.fill ?? 0) * 100)}%`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>1</span>
            <span>{cubes.length}</span>
          </div>
        </>
      )}
    </div>
  );
}

function HabitYearGrid({ habit }) {
  const years = getHabitYears(habit);
  const [selectedYear, setSelectedYear] = useState(years[0] ?? new Date().getFullYear());
  const currentYear = new Date().getFullYear();
  const currentMonthIndex = new Date().getMonth();
  const monthsToShow = Array.from({ length: selectedYear === currentYear ? currentMonthIndex + 1 : 12 }, (_, index) =>
    getMonthKey(new Date(selectedYear, index, 1))
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-lg text-emerald-900/60">Monthly distributions by year</div>
        <div className="inline-flex rounded-full bg-zinc-100 p-1">
          {years.map((year) => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedYear === year ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-white"}`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {monthsToShow.map((monthKey) => (
          <div key={monthKey} className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
            <HabitCubeGrid habit={habit} monthKey={monthKey} compact headerMode="compact" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }) {
  return (
    <div className="flex min-h-[160px] flex-col justify-between rounded-[2rem] border border-white/70 bg-white/95 p-8 shadow-sm ring-1 ring-black/5">
      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">{label}</div>
      <div className="text-5xl font-bold leading-tight text-zinc-950">
        {value}
        {suffix ? <span className="ml-1 text-3xl text-zinc-600">{suffix}</span> : null}
      </div>
    </div>
  );
}

function ModuleCard({ icon: Icon, title, subtitle, onClick, accent = "emerald", rightText }) {
  const accentMap = accent === "amber" ? "bg-amber-100 text-amber-600" : accent === "sky" ? "bg-sky-100 text-sky-600" : "bg-emerald-100 text-emerald-600";
  return (
    <button onClick={onClick} className="homepage-module-card w-full rounded-[2rem] border border-white/70 bg-white/95 p-6 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`homepage-module-accent flex h-14 w-14 items-center justify-center rounded-2xl ${accentMap}`}>
            <Icon size={24} />
          </div>
          <div>
            <div className="text-2xl font-semibold leading-snug text-zinc-950">{title}</div>
            <div className="mt-2 text-base leading-7 text-zinc-700">{subtitle}</div>
          </div>
        </div>
        <ChevronRight size={20} className="shrink-0 text-zinc-500" />
      </div>
    </button>
  );
}

function HabitCard({ habit, metrics, onSelect, onQuickToggle, onOpenLogModal, onEdit, onDelete }) {
  const colors = palette[habit.color];
  const isBuild = habit.type === "build";
  const percentLabel = `${metrics.consistency30}%`;
  const titleStyle = getHabitTitleStyle(habit.name);
  const benefitSummary = getHabitBenefitSummary(habit, metrics.totalSuccessful);

  return (
    <button onClick={() => onSelect(habit)} className="group relative w-full rounded-[2rem] border border-white/70 bg-white/95 p-6 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.75rem] ${colors.pill} text-4xl shadow-sm`}>{habit.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="w-full whitespace-nowrap font-semibold text-zinc-950" style={titleStyle}>{habit.name}</div>
            <div className={`mt-2 flex items-center gap-2 text-base ${metrics.completedToday ? colors.text : "text-zinc-500"}`}>
              {isBuild ? <Flame size={16} /> : <Shield size={16} />}
              <span>{metrics.summaryValue}</span>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="mb-3 flex justify-end gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(habit);
              }}
              className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
              aria-label={`Edit ${habit.name}`}
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(habit.id);
              }}
              className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-600 transition hover:bg-red-50 hover:text-red-600"
              aria-label={`Delete ${habit.name}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[1.75rem] bg-zinc-50/90 p-4 ring-1 ring-zinc-100">
        <HabitCubeGrid habit={habit} headerMode="compact" />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-zinc-950">{percentLabel} success rate</div>
          <div className="text-sm text-zinc-600">
            {habit.type === "reduce" && habit.target.period === "week" ? "Measured by week, not individual days" : metrics.summaryValue}
          </div>
        </div>
        {isBuild && habit.target.frequency <= 1 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickToggle(habit.id);
            }}
            className={`rounded-full border px-5 py-2.5 text-base font-semibold shadow-sm transition ${metrics.completedToday ? `${colors.button} border-transparent text-white` : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}
          >
            {metrics.completedToday ? <span className="inline-flex items-center gap-2"><Check size={16} /> Done</span> : <span className="inline-flex items-center gap-2">Mark</span>}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenLogModal(habit);
            }}
            className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-base font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          >
            {isBuild ? "Log progress" : "Log count"}
          </button>
        )}
      </div>
      {benefitSummary ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 hidden rounded-[1.3rem] border border-cyan-300/20 bg-zinc-950/95 px-4 py-3 text-sm text-white shadow-2xl group-hover:block">
          <div className="font-semibold">{benefitSummary.perSuccessLabel}</div>
          <div className="mt-1 text-white/70">{benefitSummary.totalLabel}</div>
        </div>
      ) : null}
    </button>
  );
}

function SectionHeader({ title, color, onBack }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className={`h-10 w-3 rounded-full ${color}`} />
        <h2 className="text-4xl font-bold text-emerald-950">{title}</h2>
      </div>
      {onBack ? (
        <button onClick={onBack} className="inline-flex items-center gap-2 font-medium text-emerald-900/70 hover:text-emerald-950">
          <Home size={18} /> Dashboard
        </button>
      ) : null}
    </div>
  );
}

function DetailView({ habit, metrics, onBack, onQuickToggle, onOpenLogModal, onEdit, onDelete }) {
  const colors = palette[habit.color];
  const suffix = metrics.chartXAxisMode === "weeks" ? "weeks" : metrics.chartXAxisMode === "months" ? "months" : "days";
  const isBuild = habit.type === "build";
  const benefitSummary = getHabitBenefitSummary(habit, metrics.totalSuccessful);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.12),transparent_25%),linear-gradient(135deg,#f6f8f3_0%,#eef4ef_45%,#f8efe3_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-6xl space-y-8">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-lg font-medium text-emerald-900/70 hover:text-emerald-950"><ArrowLeft size={20} /> Back to habits</button>

        <div className="rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5 md:p-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-5">
              <div className={`flex h-20 w-20 items-center justify-center rounded-3xl ${colors.pill} text-4xl shadow-sm`}>{habit.emoji}</div>
              <div>
                <div className="text-4xl font-bold text-emerald-950 md:text-5xl">{habit.name}</div>
                <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-base ${colors.pill} ${colors.text}`}>
                  {habit.type === "build" ? <Flame size={16} /> : <Shield size={16} />}
                  {habit.type === "build" ? "Build habit" : "Reduce / quit habit"}
                </div>
                {benefitSummary ? (
                  <div className="mt-3 text-base text-emerald-900/70">{benefitSummary.perSuccessLabel}</div>
                ) : null}
                <p className="mt-5 max-w-2xl text-lg text-emerald-900/70">{habit.notes}</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button onClick={() => onEdit(habit)} className="rounded-full border border-zinc-300 bg-white px-5 py-4 text-lg font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50">
                Edit habit
              </button>
              <button onClick={() => onDelete(habit.id)} className="rounded-full border border-red-200 bg-red-50 px-5 py-4 text-lg font-semibold text-red-600 shadow-sm transition hover:bg-red-100">
                Delete
              </button>
              {isBuild && habit.target.frequency <= 1 ? (
                <button onClick={() => onQuickToggle(habit.id)} className={`rounded-full px-6 py-4 text-lg font-semibold shadow-sm transition ${metrics.completedToday ? `${colors.button} text-white` : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`}>
                  {metrics.completedToday ? "Logged for today" : "Log today"}
                </button>
              ) : (
                <button onClick={() => onOpenLogModal(habit)} className="rounded-full border border-zinc-300 bg-white px-6 py-4 text-lg font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50">
                  {isBuild ? "Log progress" : "Log actual count"}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          <StatCard label="Current streak" value={metrics.currentStreak} suffix={suffix} />
          <StatCard label="Best streak" value={metrics.bestStreak} suffix={suffix} />
          <StatCard label="Success rate" value={metrics.consistency30} suffix="%" />
          {benefitSummary ? <StatCard label={benefitSummary.verb} value={formatBenefitAmount(benefitSummary.total, benefitSummary.unit)} /> : <StatCard label={metrics.periodSummaryLabel} value={metrics.periodSuccesses} />}
        </div>

        <div className="rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-3xl font-bold text-emerald-950">Monthly cubes</h3>
            <div className="text-lg text-emerald-900/60">Daily success up through today</div>
          </div>
          <div className="max-w-[18rem]">
            <HabitCubeGrid habit={habit} compact headerMode="compact" />
          </div>
        </div>

        <div className="rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-3xl font-bold text-emerald-950">Yearly view</h3>
            <div className="text-lg text-emerald-900/60">Monthly tile distributions across saved years</div>
          </div>
          <HabitYearGrid habit={habit} />
        </div>

        <div className="space-y-6 rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-3xl font-bold text-emerald-950">Progress chart</h3>
            <div className="text-lg text-emerald-900/60">{metrics.chartSummaryLabel}</div>
          </div>
          <LineChart data={metrics.chartData} xLabelMode={metrics.chartXAxisMode} color={colors.stroke} />
        </div>
      </div>
    </div>
  );
}

function AddHabitModal({ onClose, onSave, initialHabit = null }) {
  const [form, setForm] = useState(() => ({
    name: initialHabit?.name ?? "",
    emoji: initialHabit?.emoji ?? "✨",
    type: initialHabit?.type ?? "build",
    frequency: initialHabit?.target?.frequency ?? 1,
    period: initialHabit?.target?.period ?? "day",
    startDate: initialHabit?.startDate ?? getTodayDateString(),
    notes: initialHabit?.notes ?? "",
    benefitAmount: initialHabit?.benefit?.amount ?? "",
    benefitUnit: initialHabit?.benefit?.unit ?? "",
    benefitVerb: initialHabit?.benefit?.verb ?? "saved",
  }));
  const targetLabel = form.type === "build" ? (form.period === "day" ? "Daily" : `${form.frequency} / ${form.period}`) : `Max ${form.frequency} / ${form.period}`;
  const isEditing = Boolean(initialHabit);
  const benefitPreview = form.benefitAmount && form.benefitUnit.trim()
    ? `${formatBenefitAmount(Number(form.benefitAmount), form.benefitUnit)} ${form.benefitVerb || "saved"} per successful ${form.period}`
    : "Optional";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center py-6">
        <div className="w-full max-w-xl rounded-[2rem] bg-white p-8 shadow-2xl ring-1 ring-black/5 max-h-[calc(100vh-3rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-3xl font-bold text-emerald-950">{isEditing ? "Edit Habit" : "New Habit"}</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-800"><X /></button>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-emerald-900/70">Habit name</span>
            <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Evening meditation" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-emerald-900/70">Emoji</span>
              <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-emerald-900/70">Type</span>
              <select className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, period: "day", frequency: 1 })}>
                <option value="build">Build habit</option>
                <option value="reduce">Reduce / quit habit</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-emerald-900/70">Frequency</span>
              <input type="number" min="0" className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: Number(e.target.value) })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-emerald-900/70">Period</span>
              <select className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-emerald-900/70">Tracking start date</span>
            <input type="date" className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </label>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-700">Target preview: <span className="font-semibold">{targetLabel}</span></div>
          <label className="block">
            <span className="text-sm font-medium text-emerald-900/70">Notes</span>
            <textarea className="mt-2 min-h-[110px] w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Why does this habit matter to you?" />
          </label>
          <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Positive benefit</div>
            <div className="mt-1 text-sm text-zinc-600">Make the upside visible for every successful day or period.</div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-emerald-900/70">Amount</span>
                <input type="number" min="0" className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.benefitAmount} onChange={(e) => setForm({ ...form, benefitAmount: e.target.value })} placeholder="20" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-emerald-900/70">Unit</span>
                <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.benefitUnit} onChange={(e) => setForm({ ...form, benefitUnit: e.target.value })} placeholder="$ or minutes" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-emerald-900/70">Verb</span>
                <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.benefitVerb} onChange={(e) => setForm({ ...form, benefitVerb: e.target.value })} placeholder="saved" />
              </label>
            </div>
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 text-zinc-700">Benefit preview: <span className="font-semibold">{benefitPreview}</span></div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-full border border-zinc-300 px-5 py-3 font-medium text-zinc-700">Cancel</button>
          <button
            onClick={() => {
              if (!form.name.trim()) return;
              onSave({
                id: initialHabit?.id ?? `${form.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
                name: form.name,
                emoji: form.emoji,
                type: form.type,
                startDate: form.startDate || getTodayDateString(),
                target: { mode: form.type === "build" ? "daily" : "limit", frequency: form.frequency, period: form.period, label: targetLabel },
                logs: initialHabit
                  ? initialHabit.type === form.type && initialHabit.startDate === (form.startDate || getTodayDateString())
                    ? initialHabit.logs
                    : createHabitLogsForMonth(form.type, form.startDate || getTodayDateString())
                  : createHabitLogsForMonth(form.type, form.startDate || getTodayDateString()),
                notes: form.notes || "",
                benefit: form.benefitAmount && form.benefitUnit.trim()
                  ? {
                      amount: Number(form.benefitAmount),
                      unit: form.benefitUnit.trim(),
                      verb: form.benefitVerb.trim() || "saved",
                    }
                  : null,
                color: form.type === "build" ? "emerald" : "amber",
              });
              onClose();
            }}
            className="rounded-full bg-emerald-500 px-6 py-3 font-semibold text-white hover:bg-emerald-600"
          >
            {isEditing ? "Save changes" : "Add habit"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

function HabitLogModal({ habit, onClose, onSave }) {
  const lastRawValue = Array.isArray(habit?.logs) ? habit.logs[getTodayLogIndex(habit.logs.length)] ?? 0 : 0;
  const lastValue = habit?.type === "build" ? getBuildValue(lastRawValue) : Number(lastRawValue) || 0;
  const [count, setCount] = useState(lastValue);
  if (!habit) return null;
  const isBuild = habit.type === "build";
  const quickOptions = isBuild ? Array.from({ length: Math.max(5, habit.target.frequency + 2) }, (_, index) => index) : [0, 1, 2, 3, 4];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl ring-1 ring-black/5">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-3xl font-bold text-emerald-950">{isBuild ? "Log progress" : "Log count"}</h3>
            <p className="mt-1 text-emerald-900/60">{habit.name} · {habit.target.label}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-800"><X /></button>
        </div>
        <label className="mb-6 block">
          <span className="text-sm font-medium text-emerald-900/70">{isBuild ? `How many completions today? Target: ${habit.target.frequency}` : `How many times this ${habit.target.period}?`}</span>
          <input type="number" min="0" className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-2xl outline-none focus:ring-2 focus:ring-emerald-300" value={count} onChange={(e) => setCount(Math.max(0, Number(e.target.value)))} />
        </label>
        <div className="mb-8 grid grid-cols-5 gap-2">
          {quickOptions.map((n) => (
            <button key={n} onClick={() => setCount(n)} className={`rounded-2xl border py-3 text-lg font-semibold ${count === n ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300 bg-white text-zinc-700"}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-full border border-zinc-300 px-5 py-3 font-medium text-zinc-700">Cancel</button>
          <button onClick={() => onSave(habit.id, count)} className="rounded-full bg-emerald-500 px-6 py-3 font-semibold text-white hover:bg-emerald-600">Save</button>
        </div>
      </div>
    </div>
  );
}

function getTaskDate(task, field) {
  const value = task?.[field];
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function isTaskInPeriod(task, period = "week") {
  const createdAt = getTaskDate(task, "createdAt");
  if (!createdAt) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return createdAt >= start;
  }

  return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
}

function getTaskMetrics(tasks, period = "week") {
  const scopedTasks = tasks.filter((task) => isTaskInPeriod(task, period));
  const completed = scopedTasks.filter((task) => task.done).length;
  const pending = scopedTasks.length - completed;
  const completionRate = scopedTasks.length ? Math.round((completed / scopedTasks.length) * 100) : 0;

  return {
    scopedTasks,
    completed,
    pending,
    completionRate,
  };
}

function getDashboardOverviewMetrics(habits, tasks, expenses) {
  const todayHabitCount = habits.filter((habit) => getHabitMetrics(habit).completedToday).length;
  const weekHabitCount = habits.reduce((sum, habit) => sum + getHabitMetrics(habit).periodSuccesses, 0);
  const todayExpense = expenses
    .filter((expense) => isDateToday(expense.date))
    .reduce((sum, expense) => sum + expense.amount, 0);
  const weeklyExpense = expenses
    .filter((expense) => isDateWithinLastDays(expense.date, 7))
    .reduce((sum, expense) => sum + expense.amount, 0);
  const weeklyTasks = getTaskMetrics(tasks, "week");
  const pendingTasks = tasks.filter((task) => !task.done);

  return {
    todayHabitCount,
    weekHabitCount,
    todayExpense,
    weeklyExpense,
    weeklyTaskRate: weeklyTasks.completionRate,
    weeklyTasksCompleted: weeklyTasks.completed,
    pendingTasksCount: pendingTasks.length,
    totalTasksCount: tasks.length,
  };
}

function normalizeJournalEntry(entry, index = 0) {
  const date = entry.date ?? getRelativeDateString(index);
  const body = entry.body ?? entry.preview ?? "";
  return {
    id: entry.id ?? `j-${Date.now()}-${index}`,
    title: entry.title?.trim() || "Untitled entry",
    body,
    preview: getJournalPreview(body),
    date,
    updatedAt: entry.updatedAt ?? `${date}T12:00:00`,
    folderId: entry.folderId ?? null,
  };
}

function normalizeJournalEntries(entries = []) {
  return entries.map(normalizeJournalEntry).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function normalizeJournalFolders(folders = []) {
  return folders
    .map((folder, index) => ({
      id: folder.id ?? `folder-${Date.now()}-${index}`,
      name: folder.name?.trim() || `Folder ${index + 1}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeWorkoutFolders(folders = []) {
  return folders
    .map((folder, index) => ({
      id: folder.id ?? `workout-folder-${Date.now()}-${index}`,
      name: folder.name?.trim() || `Program ${index + 1}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const DEFAULT_WORKOUT_COLUMNS = [
  { id: "exercise", label: "Exercise", placeholder: "Exercise", widthClass: "min-w-[220px]" },
  { id: "sets", label: "Sets", placeholder: "4", widthClass: "w-20" },
  { id: "reps", label: "Reps", placeholder: "8-10", widthClass: "w-24" },
  { id: "load", label: "Load", placeholder: "135 lb", widthClass: "w-28" },
  { id: "rest", label: "Rest", placeholder: "90 sec", widthClass: "w-28" },
  { id: "notes", label: "Notes", placeholder: "Technique cue", widthClass: "min-w-[220px]" },
];

function getDefaultWorkoutColumns() {
  return DEFAULT_WORKOUT_COLUMNS.map((column) => ({ ...column }));
}

function normalizeWorkoutColumns(columns = []) {
  if (!Array.isArray(columns) || !columns.length) return getDefaultWorkoutColumns();
  return columns.map((column, index) => ({
    id: column.id ?? `workout-column-${Date.now()}-${index}`,
    label: column.label?.trim() || `Column ${index + 1}`,
    placeholder: column.placeholder ?? "",
    widthClass: column.widthClass ?? "w-32",
  }));
}

function createWorkoutExerciseRow(columns, exercise = {}, rowIndex = 0) {
  const legacyValues = {
    exercise: exercise.exercise ?? "",
    sets: exercise.sets ?? "",
    reps: exercise.reps ?? "",
    load: exercise.load ?? "",
    rest: exercise.rest ?? "",
    notes: exercise.notes ?? "",
  };

  const values = Object.fromEntries(columns.map((column) => {
    const rawValue = exercise.values?.[column.id] ?? legacyValues[column.id] ?? "";
    return [column.id, typeof rawValue === "string" ? rawValue : `${rawValue ?? ""}`];
  }));

  return {
    id: exercise.id ?? `exercise-${Date.now()}-${rowIndex}`,
    values,
  };
}

function normalizeWorkoutPlan(plan, index = 0) {
  const columns = normalizeWorkoutColumns(plan.columns);
  return {
    id: plan.id ?? `workout-${Date.now()}-${index}`,
    name: plan.name?.trim() || `Workout ${index + 1}`,
    folderId: plan.folderId ?? null,
    notes: plan.notes ?? "",
    updatedAt: plan.updatedAt ?? new Date().toISOString(),
    columns,
    exercises: Array.isArray(plan.exercises) && plan.exercises.length
      ? plan.exercises.map((exercise, rowIndex) => createWorkoutExerciseRow(columns, exercise, rowIndex))
      : [createWorkoutExerciseRow(columns)],
  };
}

function normalizeWorkoutPlans(plans = []) {
  return plans.map(normalizeWorkoutPlan).sort((a, b) => a.name.localeCompare(b.name));
}

function TodoPanel({ tasks, setTasks, onBack, onReset }) {
  const [newTask, setNewTask] = useState("");
  const pendingTasks = tasks.filter((task) => !task.done);
  const completedTasks = tasks.filter((task) => task.done);
  const handleReset = () => {
    setNewTask("");
    onReset();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),transparent_25%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-5xl space-y-8">
        <SectionHeader title="Tasks" color="bg-sky-500" onBack={onBack} />
        <div className="flex justify-end">
          <button onClick={handleReset} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            Reset tasks
          </button>
        </div>
        <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Task focus</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-950">{pendingTasks.length} still to do</div>
              <div className="mt-2 text-lg text-zinc-700">A quick visual split between what is left and what is already closed out.</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Completed</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-950">{completedTasks.length}</div>
            </div>
          </div>
          <div className="mt-6 overflow-hidden rounded-full bg-zinc-100">
            <div className="flex h-4">
              <div
                className="bg-sky-500 transition-all"
                style={{ width: `${tasks.length ? (pendingTasks.length / tasks.length) * 100 : 0}%` }}
              />
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${tasks.length ? (completedTasks.length / tasks.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-zinc-700">
            <span>Pending: {pendingTasks.length}</span>
            <span>Completed: {completedTasks.length}</span>
          </div>
        </div>
        <div className="flex gap-3 rounded-[2rem] bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
          <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task" className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-sky-300" />
          <button
            onClick={() => {
              if (!newTask.trim()) return;
              setTasks((current) => [...current, { id: `task-${Date.now()}`, text: newTask.trim(), done: false, createdAt: getTodayDateString(), completedAt: null }]);
              setNewTask("");
            }}
            className="rounded-2xl bg-sky-500 px-5 py-3 font-semibold text-white hover:bg-sky-600"
          >
            Add
          </button>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h3 className="text-2xl font-semibold text-zinc-950">Still to do</h3>
              <span className="rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-700">{pendingTasks.length}</span>
            </div>
            <div className="space-y-4">
              {pendingTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-sky-100 bg-sky-50/70 p-5">
                  <button
                    className="flex flex-1 items-center gap-4 text-left"
                    onClick={() => setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, done: true, completedAt: getTodayDateString() } : t)))}
                  >
                    <div className="h-6 w-6 rounded-full border-2 border-sky-300 bg-white" />
                    <div>
                      <div className="text-xl font-semibold text-zinc-950">{task.text}</div>
                      <div className="mt-1 text-sm text-zinc-600">Created {formatExpenseDate(task.createdAt ?? getTodayDateString())}</div>
                    </div>
                  </button>
                  <button onClick={() => setTasks((current) => current.filter((t) => t.id !== task.id))} className="text-zinc-400 hover:text-red-500"><X /></button>
                </div>
              ))}
              {pendingTasks.length === 0 ? <div className="rounded-2xl bg-zinc-50 p-5 text-zinc-600">No open tasks right now.</div> : null}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h3 className="text-2xl font-semibold text-zinc-950">Completed</h3>
              <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">{completedTasks.length}</span>
            </div>
            <div className="space-y-4">
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                  <button
                    className="flex flex-1 items-center gap-4 text-left"
                    onClick={() => setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, done: false, completedAt: null } : t)))}
                  >
                    <div className="h-6 w-6 rounded-full border-2 border-emerald-500 bg-emerald-500" />
                    <div>
                      <div className="text-xl font-semibold text-zinc-600 line-through">{task.text}</div>
                      <div className="mt-1 text-sm text-zinc-600">Completed {formatExpenseDate(task.completedAt ?? getTodayDateString())}</div>
                    </div>
                  </button>
                  <button onClick={() => setTasks((current) => current.filter((t) => t.id !== task.id))} className="text-zinc-400 hover:text-red-500"><X /></button>
                </div>
              ))}
              {completedTasks.length === 0 ? <div className="rounded-2xl bg-zinc-50 p-5 text-zinc-600">No completed tasks yet.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpensePanel({ expenses, setExpenses, categories, setCategories, onBack, onReset }) {
  const [view, setView] = useState("month");
  const [form, setForm] = useState({ label: "", amount: "", category: categories[0] ?? "General", date: getTodayDateString() });
  const [newCategory, setNewCategory] = useState("");
  const handleReset = () => {
    setView("month");
    setForm({ label: "", amount: "", category: initialExpenseCategories[0] ?? "General", date: getTodayDateString() });
    setNewCategory("");
    onReset();
  };
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setHours(0, 0, 0, 0);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const visibleExpenses = useMemo(() => expenses.filter((expense) => {
    const expenseDate = new Date(`${expense.date ?? getTodayDateString()}T00:00:00`);
    if (view === "week") return expenseDate >= sevenDaysAgo;
    return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
  }), [currentMonth, currentYear, expenses, sevenDaysAgo, view]);

  const total = visibleExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const largestExpense = Math.max(...visibleExpenses.map((e) => e.amount), 0);
  const categoryBreakdown = Object.entries(
    visibleExpenses.reduce((groups, expense) => {
      groups[expense.category] = (groups[expense.category] ?? 0) + expense.amount;
      return groups;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount], index) => ({
      category,
      amount,
      share: total > 0 ? Math.round((amount / total) * 100) : 0,
      fill: ["#39ff14", "#22d3ee", "#fb7185", "#f59e0b", "#a78bfa"][index % 5],
      glow: ["rgba(57,255,20,0.45)", "rgba(34,211,238,0.4)", "rgba(251,113,133,0.35)", "rgba(245,158,11,0.35)", "rgba(167,139,250,0.35)"][index % 5],
    }));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.10),transparent_25%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-5xl space-y-8">
        <SectionHeader title="Expenses" color="bg-amber-500" onBack={onBack} />
        <div className="flex justify-end">
          <button onClick={handleReset} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            Reset expenses
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-sm ring-1 ring-black/5">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">View</div>
            <div className="mt-1 text-lg text-zinc-700">Switch between this week and this month.</div>
          </div>
          <div className="inline-flex rounded-full bg-zinc-100 p-1">
            {[
              { id: "week", label: "Weekly" },
              { id: "month", label: "Monthly" },
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => setView(option.id)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${view === option.id ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-white"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <StatCard label={view === "week" ? "Weekly total" : "Monthly total"} value={total.toFixed(2)} suffix="$" />
          <StatCard label="Largest expense" value={largestExpense.toFixed(2)} suffix="$" />
        </div>
        <div className="grid gap-3 rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5 md:grid-cols-5">
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Expense" className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" type="number" className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-2xl border border-zinc-200 px-4 py-3">
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} type="date" className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <button
            onClick={() => {
              if (!form.label.trim() || !form.amount) return;
              setExpenses((current) => [...current, { id: `exp-${Date.now()}`, label: form.label.trim(), amount: Number(form.amount), category: form.category.trim() || "General", date: form.date || getTodayDateString() }]);
              setForm({ label: "", amount: "", category: categories[0] ?? "General", date: getTodayDateString() });
            }}
            className="rounded-2xl bg-amber-500 font-semibold text-white hover:bg-amber-600"
          >
            Add expense
          </button>
        </div>
        <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Categories</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-950">Manage spending buckets</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" className="rounded-2xl border border-zinc-200 px-4 py-3" />
              <button
                onClick={() => {
                  const trimmed = newCategory.trim();
                  if (!trimmed || categories.includes(trimmed)) return;
                  setCategories((current) => [...current, trimmed]);
                  setForm((current) => ({ ...current, category: trimmed }));
                  setNewCategory("");
                }}
                className="rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white hover:bg-zinc-800"
              >
                Add category
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {categories.map((category) => (
              <div key={category} className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-800">
                <span>{category}</span>
                <button
                  onClick={() => {
                    if (categories.length === 1) return;
                    setCategories((current) => current.filter((item) => item !== category));
                    setForm((current) => ({
                      ...current,
                      category: current.category === category ? categories.find((item) => item !== category) ?? "General" : current.category,
                    }));
                  }}
                  className="text-zinc-500 hover:text-red-600"
                  aria-label={`Delete ${category}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            {visibleExpenses.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between rounded-[1.5rem] border border-white/70 bg-white/95 p-5 shadow-sm ring-1 ring-black/5">
                <div>
                  <div className="text-xl font-semibold text-zinc-950">{exp.label}</div>
                  <div className="mt-1 text-base text-zinc-700">{exp.category} · {formatExpenseDate(exp.date ?? getTodayDateString())}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExpenses((current) => current.filter((item) => item.id !== exp.id))}
                    className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${exp.label}`}
                  >
                    <Trash2 size={16} />
                  </button>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-zinc-950">{formatCurrency(exp.amount)}</div>
                  </div>
                </div>
              </div>
            ))}
            {visibleExpenses.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-zinc-300 bg-white/90 p-6 text-lg text-zinc-600">
                No expenses logged in this {view}.
              </div>
            ) : null}
          </div>
          <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
            <div className="mb-5">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Category breakdown</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-950">Where the money is going</div>
            </div>
            <div className="space-y-4">
              {categoryBreakdown.map((item) => (
                <div key={item.category} className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-base font-semibold text-zinc-900">{item.category}</div>
                    <div className="text-sm text-zinc-700">{formatCurrency(item.amount)} · {item.share}%</div>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full border border-cyan-300/20 bg-slate-950/80">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(item.share, item.share > 0 ? 8 : 0)}%`,
                        background: `linear-gradient(90deg, ${item.fill} 0%, ${item.fill}dd 100%)`,
                        boxShadow: `0 0 14px ${item.glow}`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {categoryBreakdown.length === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-4 text-zinc-600">Add expenses to see your category mix.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkoutPanel({ plans, setPlans, folders, setFolders, onBack, onReset }) {
  const [activeFolderId, setActiveFolderId] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState(plans[0]?.id ?? null);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [draft, setDraft] = useState(() => {
    const firstPlan = plans[0];
    return firstPlan
      ? normalizeWorkoutPlan(firstPlan)
      : normalizeWorkoutPlan({ name: "", folderId: null, notes: "", exercises: [] });
  });

  const visiblePlans = activeFolderId === "all"
    ? plans
    : activeFolderId === "unfiled"
      ? plans.filter((plan) => !plan.folderId)
      : plans.filter((plan) => plan.folderId === activeFolderId);

  useEffect(() => {
    if (!plans.length) {
      setSelectedPlanId(null);
      setDraft(normalizeWorkoutPlan({ name: "", folderId: null, notes: "", exercises: [] }));
      return;
    }

    const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];
    setSelectedPlanId(selectedPlan.id);
    setDraft(normalizeWorkoutPlan(selectedPlan));
    setIsEditingPlan(false);
  }, [plans, selectedPlanId]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const folderNameById = Object.fromEntries(folders.map((folder) => [folder.id, folder.name]));
  const handleReset = () => {
    setActiveFolderId("all");
    setNewFolderName("");
    setNewColumnName("");
    setEditingFolderId(null);
    setEditingFolderName("");
    setSelectedPlanId(null);
    setIsEditingPlan(false);
    setDraft(normalizeWorkoutPlan({ name: "", folderId: null, notes: "", exercises: [] }));
    onReset();
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const nextFolder = { id: `workout-folder-${Date.now()}`, name: trimmed };
    setFolders((current) => normalizeWorkoutFolders([...current, nextFolder]));
    setActiveFolderId(nextFolder.id);
    setNewFolderName("");
  };

  const handleSaveFolderRename = () => {
    const trimmed = editingFolderName.trim();
    if (!editingFolderId || !trimmed) return;
    setFolders((current) => normalizeWorkoutFolders(current.map((folder) => (
      folder.id === editingFolderId ? { ...folder, name: trimmed } : folder
    ))));
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  const handleDeleteFolder = (folderId) => {
    setFolders((current) => current.filter((folder) => folder.id !== folderId));
    setPlans((current) => normalizeWorkoutPlans(current.map((plan) => (
      plan.folderId === folderId ? { ...plan, folderId: null } : plan
    ))));
    if (activeFolderId === folderId) setActiveFolderId("all");
    if (draft.folderId === folderId) {
      setDraft((current) => ({ ...current, folderId: null }));
    }
  };

  const handleCreatePlan = () => {
    const nextPlan = normalizeWorkoutPlan({
      id: `workout-${Date.now()}`,
      name: "New workout",
      folderId: activeFolderId === "all" || activeFolderId === "unfiled" ? null : activeFolderId,
      notes: "",
      exercises: [],
      updatedAt: new Date().toISOString(),
    });
    setPlans((current) => normalizeWorkoutPlans([nextPlan, ...current]));
    setSelectedPlanId(nextPlan.id);
    setDraft(nextPlan);
    setIsEditingPlan(true);
  };

  const handleSavePlan = () => {
    const trimmedName = draft.name.trim();
    if (!trimmedName) return;

    const cleanedExercises = draft.exercises
      .map((exercise) => ({
        ...exercise,
        values: Object.fromEntries(
          draft.columns.map((column) => [column.id, (exercise.values?.[column.id] ?? "").trim()]),
        ),
      }))
      .filter((exercise) => Object.values(exercise.values).some(Boolean));

    const nextPlan = normalizeWorkoutPlan({
      ...draft,
      name: trimmedName,
      columns: draft.columns,
      exercises: cleanedExercises.length ? cleanedExercises : [createWorkoutExerciseRow(draft.columns)],
      updatedAt: new Date().toISOString(),
    });

    setPlans((current) => {
      const exists = current.some((plan) => plan.id === nextPlan.id);
      if (!exists) return normalizeWorkoutPlans([nextPlan, ...current]);
      return normalizeWorkoutPlans(current.map((plan) => (plan.id === nextPlan.id ? nextPlan : plan)));
    });
    setSelectedPlanId(nextPlan.id);
    setIsEditingPlan(false);
  };

  const handleDeletePlan = (planId) => {
    setPlans((current) => current.filter((plan) => plan.id !== planId));
  };

  const updateExercise = (exerciseId, key, value) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => (
        exercise.id === exerciseId
          ? { ...exercise, values: { ...exercise.values, [key]: value } }
          : exercise
      )),
    }));
  };

  const addExerciseRow = () => {
    setDraft((current) => ({
      ...current,
      exercises: [
        ...current.exercises,
        createWorkoutExerciseRow(current.columns, { id: `exercise-${Date.now()}` }),
      ],
    }));
  };

  const removeExerciseRow = (exerciseId) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.length === 1
        ? [createWorkoutExerciseRow(current.columns, { id: `exercise-${Date.now()}` })]
        : current.exercises.filter((exercise) => exercise.id !== exerciseId),
    }));
  };

  const addExerciseColumn = () => {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    setDraft((current) => {
      const nextColumn = {
        id: `workout-column-${Date.now()}`,
        label: trimmed,
        placeholder: trimmed,
        widthClass: "w-32",
      };
      return {
        ...current,
        columns: [...current.columns, nextColumn],
        exercises: current.exercises.map((exercise) => ({
          ...exercise,
          values: {
            ...exercise.values,
            [nextColumn.id]: "",
          },
        })),
      };
    });
    setNewColumnName("");
  };

  const removeExerciseColumn = (columnId) => {
    setDraft((current) => {
      if (current.columns.length === 1) return current;
      const nextColumns = current.columns.filter((column) => column.id !== columnId);
      return {
        ...current,
        columns: nextColumns,
        exercises: current.exercises.map((exercise) => ({
          ...exercise,
          values: Object.fromEntries(nextColumns.map((column) => [column.id, exercise.values?.[column.id] ?? ""])),
        })),
      };
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),transparent_22%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-7xl space-y-8">
        <SectionHeader title="Workout Planner" color="bg-amber-500" onBack={onBack} />
        <div className="flex justify-end">
          <button onClick={handleReset} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            Reset workouts
          </button>
        </div>
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.35fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Programs</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-950">Build splits and day templates inside the app</div>
                  <div className="mt-2 text-base text-zinc-700">Create folders like Upper / Lower or Push Pull Legs, then save each workout sheet inside them.</div>
                </div>
                <button onClick={handleCreatePlan} className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
                  New workout
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-5">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Folders</div>
                <div className="mt-2 text-2xl font-semibold text-zinc-950">Organize your workout library</div>
              </div>
              <div className="flex gap-3">
                <input
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="New folder name"
                  className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:ring-2 focus:ring-amber-300"
                />
                <button onClick={handleCreateFolder} className="rounded-2xl bg-zinc-950 px-4 py-3 font-semibold text-white hover:bg-zinc-800">
                  Add
                </button>
              </div>
              <div className="mt-5 space-y-3">
                <button
                  onClick={() => setActiveFolderId("all")}
                  className={`flex w-full items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left ${activeFolderId === "all" ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-zinc-50"}`}
                >
                  <span className="font-semibold text-zinc-900">All workouts</span>
                  <span className="text-sm text-zinc-500">{plans.length}</span>
                </button>
                <button
                  onClick={() => setActiveFolderId("unfiled")}
                  className={`flex w-full items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left ${activeFolderId === "unfiled" ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-zinc-50"}`}
                >
                  <span className="font-semibold text-zinc-900">Unfiled</span>
                  <span className="text-sm text-zinc-500">{plans.filter((plan) => !plan.folderId).length}</span>
                </button>
                {folders.map((folder) => (
                  <div key={folder.id} className={`rounded-[1.2rem] border px-4 py-3 ${activeFolderId === folder.id ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-zinc-50"}`}>
                    {editingFolderId === folder.id ? (
                      <div className="flex gap-2">
                        <input
                          value={editingFolderName}
                          onChange={(event) => setEditingFolderName(event.target.value)}
                          className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-300"
                        />
                        <button onClick={handleSaveFolderRename} className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600">Save</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <button onClick={() => setActiveFolderId(folder.id)} className="flex-1 text-left">
                          <div className="font-semibold text-zinc-900">{folder.name}</div>
                          <div className="text-sm text-zinc-500">{plans.filter((plan) => plan.folderId === folder.id).length} workouts</div>
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingFolderId(folder.id);
                              setEditingFolderName(folder.name);
                            }}
                            className="rounded-full p-2 text-zinc-400 hover:bg-white hover:text-zinc-700"
                            aria-label={`Rename ${folder.name}`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteFolder(folder.id)}
                            className="rounded-full p-2 text-zinc-400 hover:bg-white hover:text-red-500"
                            aria-label={`Delete ${folder.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-5">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Workout sheets</div>
                <div className="mt-2 text-2xl font-semibold text-zinc-950">{visiblePlans.length} visible plans</div>
              </div>
              <div className="space-y-3">
                {visiblePlans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      setIsEditingPlan(false);
                    }}
                    className={`w-full rounded-[1.5rem] border p-5 text-left transition ${
                      plan.id === selectedPlanId
                        ? "border-amber-300 bg-amber-50/80 shadow-sm"
                        : "border-zinc-200 bg-zinc-50 hover:border-amber-200 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-zinc-950">{plan.name}</div>
                        <div className="mt-2 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                          {plan.folderId ? folderNameById[plan.folderId] ?? "Folder" : "Unfiled"}
                        </div>
                        <div className="mt-3 text-sm text-zinc-700">{plan.exercises.length} exercises</div>
                      </div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeletePlan(plan.id);
                        }}
                        className="rounded-full p-2 text-zinc-400 transition hover:bg-white hover:text-red-500"
                        aria-label={`Delete ${plan.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </button>
                ))}
                {visiblePlans.length === 0 ? <div className="rounded-2xl bg-zinc-50 p-5 text-zinc-600">No workout sheets in this view yet.</div> : null}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
            {selectedPlan && !isEditingPlan ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Workout sheet</div>
                    <div className="mt-2 text-3xl font-semibold text-zinc-950">{selectedPlan.name}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">
                        {selectedPlan.folderId ? folderNameById[selectedPlan.folderId] ?? "Folder" : "Unfiled"}
                      </div>
                      <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">
                        Updated {new Date(selectedPlan.updatedAt).toLocaleDateString()}
                      </div>
                      <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">
                        {selectedPlan.columns.length} columns
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setIsEditingPlan(true)} className="rounded-2xl bg-amber-500 px-5 py-3 font-semibold text-white hover:bg-amber-600">
                    Edit workout
                  </button>
                </div>
                {selectedPlan.notes ? (
                  <div className="mt-5 rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-5 text-zinc-700">{selectedPlan.notes}</div>
                ) : null}
                <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-zinc-200 bg-zinc-50">
                  <table className="min-w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-zinc-200 text-sm uppercase tracking-[0.16em] text-zinc-500">
                        {selectedPlan.columns.map((column) => (
                          <th key={column.id} className="px-4 py-4">{column.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPlan.exercises.map((exercise) => (
                        <tr key={exercise.id} className="border-b border-zinc-200 last:border-b-0">
                          {selectedPlan.columns.map((column, columnIndex) => (
                            <td key={column.id} className={`px-4 py-4 ${columnIndex === 0 ? "font-semibold text-zinc-950" : "text-zinc-700"}`}>
                              {exercise.values?.[column.id] || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Planner editor</div>
                    <div className="mt-2 text-3xl font-semibold text-zinc-950">{selectedPlan ? "Edit your workout sheet" : "Create a new workout sheet"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">{draft.exercises.length} rows</div>
                    <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">{draft.columns.length} columns</div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4">
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Workout name"
                    className="rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-amber-300"
                  />
                  <select
                    value={draft.folderId ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, folderId: event.target.value || null }))}
                    className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="">Unfiled</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                  <textarea
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Workout notes, focus, progression cue, or warmup reminder"
                    className="min-h-[120px] rounded-[1.5rem] border border-zinc-200 px-4 py-4 text-base leading-7 outline-none focus:ring-2 focus:ring-amber-300"
                  />

                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      value={newColumnName}
                      onChange={(event) => setNewColumnName(event.target.value)}
                      placeholder="New column name"
                      className="rounded-2xl border border-zinc-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    <button onClick={addExerciseColumn} className="rounded-2xl border border-zinc-200 px-4 py-3 font-semibold text-zinc-700 hover:bg-zinc-50">
                      Add column
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-[1.5rem] border border-zinc-200 bg-zinc-50">
                    <table className="min-w-[960px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-zinc-200 text-sm uppercase tracking-[0.16em] text-zinc-500">
                          {draft.columns.map((column) => (
                            <th key={column.id} className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <span>{column.label}</span>
                                <button onClick={() => removeExerciseColumn(column.id)} className="rounded-full border border-zinc-200 bg-white p-1 text-zinc-400 hover:text-red-500" title={`Delete ${column.label} column`}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </th>
                          ))}
                          <th className="px-4 py-4">Row</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draft.exercises.map((exercise) => (
                          <tr key={exercise.id} className="border-b border-zinc-200 last:border-b-0">
                            {draft.columns.map((column) => (
                              <td key={column.id} className="px-4 py-3">
                                <input
                                  value={exercise.values?.[column.id] ?? ""}
                                  onChange={(event) => updateExercise(exercise.id, column.id, event.target.value)}
                                  className={`${column.widthClass ?? "w-32"} rounded-xl border border-zinc-200 px-3 py-2`}
                                  placeholder={column.placeholder || column.label}
                                />
                              </td>
                            ))}
                            <td className="px-4 py-3">
                              <button onClick={() => removeExerciseRow(exercise.id)} className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-400 hover:text-red-500">
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button onClick={addExerciseRow} className="rounded-2xl border border-zinc-200 px-4 py-3 font-semibold text-zinc-700 hover:bg-zinc-50">
                      Add row
                    </button>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          if (selectedPlan) {
                            setDraft(normalizeWorkoutPlan(selectedPlan));
                            setIsEditingPlan(false);
                            return;
                          }
                          setDraft(normalizeWorkoutPlan({ name: "", folderId: null, notes: "", exercises: [] }));
                        }}
                        className="rounded-2xl border border-zinc-200 px-4 py-3 font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        {selectedPlan ? "Cancel" : "Reset"}
                      </button>
                      <button onClick={handleSavePlan} className="rounded-2xl bg-amber-500 px-5 py-3 font-semibold text-white hover:bg-amber-600">
                        Save workout
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function JournalPanel({ entries, setEntries, folders, setFolders, onBack, onReset }) {
  const [prompts] = useState(() => getRandomJournalPrompts());
  const [activeFolderId, setActiveFolderId] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? null);
  const [isEditingEntry, setIsEditingEntry] = useState(false);
  const [draft, setDraft] = useState(() => {
    const firstEntry = entries[0];
    return firstEntry
      ? { title: firstEntry.title, body: firstEntry.body, date: firstEntry.date, folderId: firstEntry.folderId ?? null }
      : { title: "", body: "", date: getTodayDateString(), folderId: null };
  });

  const visibleEntries = activeFolderId === "all"
    ? entries
    : activeFolderId === "unfiled"
      ? entries.filter((entry) => !entry.folderId)
      : entries.filter((entry) => entry.folderId === activeFolderId);

  useEffect(() => {
    if (!entries.length) {
      setSelectedId(null);
      setDraft({ title: "", body: "", date: getTodayDateString(), folderId: null });
      return;
    }

    const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? entries[0];
    setSelectedId(selectedEntry.id);
    setDraft({
      title: selectedEntry.title,
      body: selectedEntry.body,
      date: selectedEntry.date,
      folderId: selectedEntry.folderId ?? null,
    });
    setIsEditingEntry(false);
  }, [entries, selectedId]);

  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;
  const bodyWordCount = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0;
  const folderNameById = Object.fromEntries(folders.map((folder) => [folder.id, folder.name]));
  const handleReset = () => {
    setActiveFolderId("all");
    setNewFolderName("");
    setEditingFolderId(null);
    setEditingFolderName("");
    setSelectedId(null);
    setIsEditingEntry(false);
    setDraft({ title: "", body: "", date: getTodayDateString(), folderId: null });
    onReset();
  };

  const handleCreateEntry = (promptTitle = "New reflection") => {
    const timestamp = Date.now();
    const date = getTodayDateString();
    const newEntry = normalizeJournalEntry({
      id: `j-${timestamp}`,
      title: promptTitle,
      body: "",
      date,
      updatedAt: new Date(timestamp).toISOString(),
      folderId: activeFolderId === "all" || activeFolderId === "unfiled" ? null : activeFolderId,
    });
    setEntries((current) => [newEntry, ...current]);
    setSelectedId(newEntry.id);
    setIsEditingEntry(true);
  };

  const handleSaveEntry = () => {
    const trimmedTitle = draft.title.trim();
    const trimmedBody = draft.body.trim();
    if (!trimmedTitle || !trimmedBody) return;

    const nextEntry = normalizeJournalEntry({
      id: selectedEntry?.id ?? `j-${Date.now()}`,
      title: trimmedTitle,
      body: trimmedBody,
      date: draft.date || getTodayDateString(),
      updatedAt: new Date().toISOString(),
      folderId: draft.folderId || null,
    });

    setEntries((current) => {
      const exists = current.some((entry) => entry.id === nextEntry.id);
      if (!exists) return normalizeJournalEntries([nextEntry, ...current]);
      return normalizeJournalEntries(current.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry)));
    });
    setSelectedId(nextEntry.id);
    setIsEditingEntry(false);
  };

  const handleDeleteEntry = (entryId) => {
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const nextFolder = { id: `folder-${Date.now()}`, name: trimmed };
    setFolders((current) => normalizeJournalFolders([...current, nextFolder]));
    setNewFolderName("");
    setActiveFolderId(nextFolder.id);
  };

  const handleSaveFolderRename = () => {
    const trimmed = editingFolderName.trim();
    if (!editingFolderId || !trimmed) return;
    setFolders((current) => normalizeJournalFolders(current.map((folder) => (
      folder.id === editingFolderId ? { ...folder, name: trimmed } : folder
    ))));
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  const handleDeleteFolder = (folderId) => {
    setFolders((current) => current.filter((folder) => folder.id !== folderId));
    setEntries((current) => normalizeJournalEntries(current.map((entry) => (
      entry.folderId === folderId ? { ...entry, folderId: null } : entry
    ))));
    if (activeFolderId === folderId) setActiveFolderId("all");
    if (draft.folderId === folderId) {
      setDraft((current) => ({ ...current, folderId: null }));
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.10),transparent_25%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-6xl space-y-8">
        <SectionHeader title="Journal" color="bg-emerald-500" onBack={onBack} />
        <div className="flex justify-end">
          <button onClick={handleReset} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            Reset journal
          </button>
        </div>
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Prompt starters</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-950">Write from a useful question</div>
                </div>
                <button onClick={() => handleCreateEntry()} className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
                  New entry
                </button>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleCreateEntry(prompt)}
                    className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-5">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Folders</div>
                <div className="mt-2 text-2xl font-semibold text-zinc-950">Organize your entries</div>
              </div>
              <div className="flex gap-3">
                <input
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="New folder name"
                  className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-300"
                />
                <button onClick={handleCreateFolder} className="rounded-2xl bg-zinc-950 px-4 py-3 font-semibold text-white hover:bg-zinc-800">
                  Add
                </button>
              </div>
              <div className="mt-5 space-y-3">
                <button
                  onClick={() => setActiveFolderId("all")}
                  className={`flex w-full items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left ${activeFolderId === "all" ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-zinc-50"}`}
                >
                  <span className="font-semibold text-zinc-900">All entries</span>
                  <span className="text-sm text-zinc-500">{entries.length}</span>
                </button>
                <button
                  onClick={() => setActiveFolderId("unfiled")}
                  className={`flex w-full items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left ${activeFolderId === "unfiled" ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-zinc-50"}`}
                >
                  <span className="font-semibold text-zinc-900">Unfiled</span>
                  <span className="text-sm text-zinc-500">{entries.filter((entry) => !entry.folderId).length}</span>
                </button>
                {folders.map((folder) => (
                  <div key={folder.id} className={`rounded-[1.2rem] border px-4 py-3 ${activeFolderId === folder.id ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-zinc-50"}`}>
                    {editingFolderId === folder.id ? (
                      <div className="flex gap-2">
                        <input
                          value={editingFolderName}
                          onChange={(event) => setEditingFolderName(event.target.value)}
                          className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-300"
                        />
                        <button onClick={handleSaveFolderRename} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600">Save</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <button onClick={() => setActiveFolderId(folder.id)} className="flex-1 text-left">
                          <div className="font-semibold text-zinc-900">{folder.name}</div>
                          <div className="text-sm text-zinc-500">{entries.filter((entry) => entry.folderId === folder.id).length} entries</div>
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingFolderId(folder.id);
                              setEditingFolderName(folder.name);
                            }}
                            className="rounded-full p-2 text-zinc-400 hover:bg-white hover:text-zinc-700"
                            aria-label={`Rename ${folder.name}`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteFolder(folder.id)}
                            className="rounded-full p-2 text-zinc-400 hover:bg-white hover:text-red-500"
                            aria-label={`Delete ${folder.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Entries</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-950">{visibleEntries.length} visible reflections</div>
                </div>
              </div>
              <div className="space-y-3">
                {visibleEntries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setSelectedId(entry.id);
                      setIsEditingEntry(false);
                    }}
                    className={`w-full rounded-[1.5rem] border p-5 text-left transition ${
                      entry.id === selectedId
                        ? "border-emerald-300 bg-emerald-50/80 shadow-sm"
                        : "border-zinc-200 bg-zinc-50 hover:border-emerald-200 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-zinc-950">{entry.title}</div>
                        <div className="mt-1 text-sm text-zinc-500">{formatLongDate(entry.date)}</div>
                        <div className="mt-2 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                          {entry.folderId ? folderNameById[entry.folderId] ?? "Folder" : "Unfiled"}
                        </div>
                      </div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteEntry(entry.id);
                        }}
                        className="rounded-full p-2 text-zinc-400 transition hover:bg-white hover:text-red-500"
                        aria-label={`Delete ${entry.title}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-zinc-700">{entry.preview}</div>
                  </button>
                ))}
                {visibleEntries.length === 0 ? <div className="rounded-2xl bg-zinc-50 p-5 text-zinc-600">No entries in this view yet.</div> : null}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
            {selectedEntry && !isEditingEntry ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Entry</div>
                    <div className="mt-2 text-2xl font-semibold text-zinc-950">{selectedEntry.title}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">{formatLongDate(selectedEntry.date)}</div>
                      <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">
                        {selectedEntry.folderId ? folderNameById[selectedEntry.folderId] ?? "Folder" : "Unfiled"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsEditingEntry(true)}
                    className="rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600"
                  >
                    Edit entry
                  </button>
                </div>
                <div className="mt-6 max-h-[36rem] overflow-y-auto rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-6">
                  <div className="whitespace-pre-wrap text-base leading-8 text-zinc-800">{selectedEntry.body}</div>
                </div>
                <div className="mt-4 text-sm text-zinc-500">Last updated {new Date(selectedEntry.updatedAt).toLocaleString()}</div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Editor</div>
                    <div className="mt-2 text-2xl font-semibold text-zinc-950">{selectedEntry ? "Refine the reflection" : "Start a new note"}</div>
                  </div>
                  <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">{bodyWordCount} words</div>
                </div>

                <div className="mt-6 grid gap-4">
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Entry title"
                    className="rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <input
                    value={draft.date}
                    onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                    type="date"
                    className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <select
                    value={draft.folderId ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, folderId: event.target.value || null }))}
                    className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    <option value="">Unfiled</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                  <textarea
                    value={draft.body}
                    onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                    placeholder="What stood out today? What made the day more stable? What do you want to remember?"
                    className="min-h-[340px] rounded-[1.5rem] border border-zinc-200 px-4 py-4 text-base leading-7 outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-zinc-500">
                      {selectedEntry ? `Last updated ${new Date(selectedEntry.updatedAt).toLocaleString()}` : "Create an entry, then save when it feels honest enough."}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          if (selectedEntry) {
                            setDraft({ title: selectedEntry.title, body: selectedEntry.body, date: selectedEntry.date, folderId: selectedEntry.folderId ?? null });
                            setIsEditingEntry(false);
                            return;
                          }
                          setDraft({ title: "", body: "", date: getTodayDateString(), folderId: null });
                        }}
                        className="rounded-2xl border border-zinc-200 px-4 py-3 font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        {selectedEntry ? "Cancel" : "Reset"}
                      </button>
                      <button
                        onClick={handleSaveEntry}
                        className="rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600"
                      >
                        Save entry
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HabitPanel({ habits, setHabits, onBack, onReset }) {
  const [selectedHabit, setSelectedHabit] = useState(null);
  const [addingHabit, setAddingHabit] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [loggingHabit, setLoggingHabit] = useState(null);
  const buildHabits = useMemo(() => habits.filter((h) => h.type === "build"), [habits]);
  const reduceHabits = useMemo(() => habits.filter((h) => h.type === "reduce"), [habits]);
  const todaysGoals = useMemo(() => habits.filter((h) => getHabitMetrics(h).completedToday).length, [habits]);
  const pendingHabits = useMemo(() => habits.filter((h) => !getHabitMetrics(h).completedToday), [habits]);
  const handleReset = () => {
    setSelectedHabit(null);
    setAddingHabit(false);
    setEditingHabit(null);
    setLoggingHabit(null);
    onReset();
  };

  const quickToggleBuildHabit = (habitId) => {
    setHabits((current) => current.map((habit) => {
      if (habit.id !== habitId || habit.type !== "build") return habit;
      const nextLogs = [...habit.logs];
      const todayIndex = getTodayLogIndex(nextLogs.length);
      const currentValue = getBuildValue(nextLogs[todayIndex]);
      nextLogs[todayIndex] = currentValue >= 1 ? 0 : 1;
      const monthKey = getMonthKey();
      return {
        ...habit,
        logs: nextLogs,
        history: {
          ...getHabitHistory(habit),
          [monthKey]: nextLogs,
        },
      };
    }));
  };

  const saveReduceCount = (habitId, count) => {
    setHabits((current) => current.map((habit) => {
      if (habit.id !== habitId || habit.type !== "reduce") return habit;
      const nextLogs = [...habit.logs];
      const todayIndex = getTodayLogIndex(nextLogs.length);
      nextLogs[todayIndex] = count;
      const monthKey = getMonthKey();
      return {
        ...habit,
        logs: nextLogs,
        history: {
          ...getHabitHistory(habit),
          [monthKey]: nextLogs,
        },
      };
    }));
    setLoggingHabit(null);
  };

  const saveBuildCount = (habitId, count) => {
    setHabits((current) => current.map((habit) => {
      if (habit.id !== habitId || habit.type !== "build") return habit;
      const nextLogs = [...habit.logs];
      const todayIndex = getTodayLogIndex(nextLogs.length);
      nextLogs[todayIndex] = count;
      const monthKey = getMonthKey();
      return {
        ...habit,
        logs: nextLogs,
        history: {
          ...getHabitHistory(habit),
          [monthKey]: nextLogs,
        },
      };
    }));
    setLoggingHabit(null);
  };

  const handleSaveHabit = (habit) => {
    setHabits((current) => {
      const exists = current.some((item) => item.id === habit.id);
      const monthKey = getMonthKey();
      const nextHabit = {
        ...habit,
        history: {
          ...getHabitHistory(habit),
          [monthKey]: habit.logs,
        },
      };
      if (!exists) return [...current, nextHabit];
      return current.map((item) => (item.id === habit.id ? { ...item, ...nextHabit } : item));
    });
    setEditingHabit(null);
  };

  const handleDeleteHabit = (habitId) => {
    setHabits((current) => current.filter((habit) => habit.id !== habitId));
    if (selectedHabit?.id === habitId) setSelectedHabit(null);
    if (editingHabit?.id === habitId) setEditingHabit(null);
    if (loggingHabit?.id === habitId) setLoggingHabit(null);
  };

  if (selectedHabit) {
    const freshHabit = habits.find((h) => h.id === selectedHabit.id) || selectedHabit;
    return (
      <>
        <DetailView habit={freshHabit} metrics={getHabitMetrics(freshHabit)} onBack={() => setSelectedHabit(null)} onQuickToggle={quickToggleBuildHabit} onOpenLogModal={setLoggingHabit} onEdit={setEditingHabit} onDelete={handleDeleteHabit} />
        {loggingHabit ? <HabitLogModal habit={loggingHabit} onClose={() => setLoggingHabit(null)} onSave={loggingHabit.type === "build" ? saveBuildCount : saveReduceCount} /> : null}
        {editingHabit ? <AddHabitModal initialHabit={editingHabit} onClose={() => setEditingHabit(null)} onSave={handleSaveHabit} /> : null}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),transparent_22%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-[1500px]">
        <SectionHeader title="Habits" color="bg-emerald-600" onBack={onBack} />
        <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <div className="rounded-[1.6rem] bg-white/80 px-6 py-4 text-xl text-emerald-900/70 shadow-sm ring-1 ring-black/5">Today&apos;s goals <span className="ml-2 font-bold text-emerald-950">{todaysGoals}/{habits.length}</span></div>
            {pendingHabits.length > 0 ? (
              <div className="max-w-4xl rounded-[1.6rem] bg-white/80 px-6 py-5 shadow-sm ring-1 ring-black/5">
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Pending today</div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {pendingHabits.map((habit) => (
                    <button
                      key={habit.id}
                      onClick={() => setSelectedHabit(habit)}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:border-emerald-300 hover:bg-emerald-50/70"
                    >
                      <span>{habit.emoji}</span>
                      <span>{habit.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleReset} className="rounded-[1.2rem] border border-zinc-300 px-5 py-3 text-lg font-semibold text-zinc-700 hover:bg-zinc-50">
              Reset habits
            </button>
            <button onClick={() => setAddingHabit(true)} className="inline-flex items-center gap-2 rounded-[1.2rem] bg-emerald-600 px-5 py-3 text-lg font-semibold text-white shadow-md shadow-emerald-500/15 hover:bg-emerald-700"><Plus size={20} /> New Habit</button>
          </div>
        </div>
        <div className="space-y-14">
          <section>
            <SectionHeader title="Build Habits" color="bg-emerald-600" />
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {buildHabits.map((habit) => (
                <HabitCard key={habit.id} habit={habit} metrics={getHabitMetrics(habit)} onSelect={setSelectedHabit} onQuickToggle={quickToggleBuildHabit} onOpenLogModal={setLoggingHabit} onEdit={setEditingHabit} onDelete={handleDeleteHabit} />
              ))}
            </div>
            {buildHabits.length === 0 ? <div className="mt-6 rounded-[1.5rem] border border-dashed border-zinc-300 bg-white/90 p-6 text-lg text-zinc-600">No build habits yet. Add one to start tracking your daily wins.</div> : null}
          </section>
          <section>
            <SectionHeader title="Reduce Limits" color="bg-amber-500" />
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {reduceHabits.map((habit) => (
                <HabitCard key={habit.id} habit={habit} metrics={getHabitMetrics(habit)} onSelect={setSelectedHabit} onQuickToggle={quickToggleBuildHabit} onOpenLogModal={setLoggingHabit} onEdit={setEditingHabit} onDelete={handleDeleteHabit} />
              ))}
            </div>
            {reduceHabits.length === 0 ? <div className="mt-6 rounded-[1.5rem] border border-dashed border-zinc-300 bg-white/90 p-6 text-lg text-zinc-600">No reduce habits yet. Add a limit you want to keep visible.</div> : null}
          </section>
        </div>
      </div>
      {addingHabit ? <AddHabitModal onClose={() => setAddingHabit(false)} onSave={handleSaveHabit} /> : null}
      {editingHabit ? <AddHabitModal initialHabit={editingHabit} onClose={() => setEditingHabit(null)} onSave={handleSaveHabit} /> : null}
      {loggingHabit ? <HabitLogModal habit={loggingHabit} onClose={() => setLoggingHabit(null)} onSave={loggingHabit.type === "build" ? saveBuildCount : saveReduceCount} /> : null}
    </div>
  );
}

function DashboardHome({ habits, tasks, expenses, workoutPlans, onOpenSection, calendarUrl }) {
  const completedTasks = tasks.filter((task) => task.done).length;
  const pendingTasks = tasks.filter((task) => !task.done);
  const expenseTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const overview = getDashboardOverviewMetrics(habits, tasks, expenses);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),transparent_22%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-[1500px] space-y-10">
        <div>
          <div>
            <div className="text-5xl">🍃</div>
            <h1 className="mt-2 text-5xl font-bold tracking-tight text-emerald-950 md:text-6xl">Personal Wellness Dashboard</h1>
            <p className="mt-3 max-w-3xl text-2xl text-emerald-900/60">A one-stop page for your habits, tasks, training, expenses, and reflection.</p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/70 bg-white/95 p-8 shadow-sm ring-1 ring-black/5">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Metrics overview</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-950">Today</div>
            </div>
            <button onClick={() => onOpenSection("tasks")} className="rounded-full bg-zinc-950 px-5 py-2 font-semibold text-white hover:bg-zinc-800">
              Review tasks
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="homepage-inner-card rounded-[1.5rem] bg-zinc-50 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Today</div>
              <div className="mt-3 text-3xl font-semibold text-zinc-950">{overview.todayHabitCount}/{habits.length}</div>
              <div className="mt-2 text-base text-zinc-700">Habits completed today</div>
            </div>
            <div className="homepage-inner-card rounded-[1.5rem] bg-zinc-50 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Today</div>
              <div className="mt-3 text-3xl font-semibold text-zinc-950">{overview.pendingTasksCount}/{overview.totalTasksCount}</div>
              <div className="mt-2 text-base text-zinc-700">Tasks still pending</div>
            </div>
            <div className="homepage-inner-card rounded-[1.5rem] bg-zinc-50 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Today</div>
              <div className="mt-3 text-3xl font-semibold text-zinc-950">{formatCurrency(overview.todayExpense)}</div>
              <div className="mt-2 text-base text-zinc-700">Spent today</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ModuleCard icon={Flame} title="Habit Tracking" subtitle="Open your streak dashboard, add habits, and log progress." rightText={`${habits.length} habits`} onClick={() => onOpenSection("habits")} />
          <ModuleCard icon={ListTodo} title="Tasks" subtitle="Keep today’s responsibilities visible and actionable." rightText={`${completedTasks}/${tasks.length} done`} accent="sky" onClick={() => onOpenSection("tasks")} />
          <ModuleCard icon={Dumbbell} title="Workout Planner" subtitle="Create spreadsheet-style workouts, save templates, and organize them into folders." rightText={`${workoutPlans.length} plans`} accent="amber" onClick={() => onOpenSection("workouts")} />
          <ModuleCard icon={Wallet} title="Expense Tracker" subtitle="Track this week or month and see category breakdowns at a glance." rightText={formatCurrency(expenseTotal)} accent="amber" onClick={() => onOpenSection("expenses")} />
          <ModuleCard icon={BookOpen} title="Journal" subtitle="Capture reflections, prompts, and what helped the day feel clear." rightText="Reflection" onClick={() => onOpenSection("journal")} />
          <ModuleCard icon={CalendarDays} title="Google Calendar" subtitle="Open Google Calendar in a new tab to check your schedule." rightText="Open gcal" accent="sky" onClick={() => window.open(calendarUrl, "_blank", "noopener,noreferrer")} />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5 xl:col-span-2">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-3xl font-bold text-emerald-950">Habit snapshot</h2>
              <button onClick={() => onOpenSection("habits")} className="rounded-full bg-emerald-500 px-5 py-2 font-semibold text-white hover:bg-emerald-600">Open habits</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {habits.slice(0, 4).map((habit) => {
                const metrics = getHabitMetrics(habit);
                return (
                  <div key={habit.id} className="homepage-inner-card rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-5">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{habit.emoji}</div>
                        <div>
                          <div className="max-w-[12rem] whitespace-nowrap font-semibold text-emerald-950" style={getHabitTitleStyle(habit.name)}>{habit.name}</div>
                          <div className="text-emerald-900/55">{formatStreakLabel(metrics.currentStreak, metrics.chartXAxisMode === "weeks" ? "week" : metrics.chartXAxisMode === "months" ? "month" : "day")}</div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-emerald-950">{metrics.consistency30}%</div>
                    </div>
                    <div className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">{getCurrentMonthLabel()}</div>
                    <LineChart data={metrics.chartData} xLabelMode={metrics.chartXAxisMode} color={palette[habit.color].stroke} />
                  </div>
                );
              })}
            </div>
            {habits.length === 0 ? <div className="mt-4 rounded-[1.5rem] border border-dashed border-zinc-300 bg-white/90 p-6 text-lg text-zinc-600">No habits added yet. Create your first habit to populate your dashboard snapshot.</div> : null}
          </div>

          <div className="rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-3xl font-bold text-emerald-950">Tasks quick view</h2>
              <button onClick={() => onOpenSection("tasks")} className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
                Open tasks
              </button>
            </div>
            <div className="space-y-3">
              {pendingTasks.map((task) => (
                <div key={task.id} className="homepage-inner-card flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="h-4 w-4 rounded-full bg-zinc-300" />
                  <div className="text-lg text-zinc-950">{task.text}</div>
                </div>
              ))}
              {pendingTasks.length === 0 ? (
                <div className="homepage-inner-card rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-lg text-zinc-600">
                  No pending tasks right now.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncBadge({ syncStatus, userEmail, onSignOut, isCloudEnabled }) {
  return (
    <div className="mb-4 flex justify-end">
      <div className="group relative flex items-center gap-2 rounded-full border border-cyan-300/20 bg-zinc-950/88 px-3 py-2 text-xs font-semibold text-white shadow-2xl backdrop-blur">
        <span className={`h-2.5 w-2.5 rounded-full ${isCloudEnabled ? "bg-[#39ff14] shadow-[0_0_12px_rgba(57,255,20,0.9)]" : "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]"}`} />
        <span>{isCloudEnabled ? "Cloud sync on" : "Local mode"}</span>
        <div className="hidden text-white/60 md:block">{userEmail ?? ""}</div>
        {onSignOut ? (
          <button onClick={onSignOut} className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10">
            Sign out
          </button>
        ) : null}
        <div className="pointer-events-none absolute right-0 top-full mt-2 hidden w-64 rounded-2xl border border-white/10 bg-zinc-950/95 p-3 text-left text-xs font-medium text-white/80 shadow-2xl group-hover:block">
          <div>{syncStatus}</div>
          {userEmail ? <div className="mt-1 text-white/45">{userEmail}</div> : null}
        </div>
      </div>
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setMessage("");

    const action =
      mode === "signup"
        ? supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
            },
          })
        : supabase.auth.signInWithPassword({
            email,
            password,
          });

    const { data, error } = await action;

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    if (mode === "signup" && !data.session) {
      setMessage("Account created. Check your email to confirm the account, then sign in.");
    }

    if (mode === "signup" && data.session) {
      setMessage("Account created and signed in.");
    }

    if (mode === "signin") {
      setMessage("Signed in. Loading your dashboard...");
    }

    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),transparent_22%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-10 md:px-10">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-white/70 bg-white/95 p-8 shadow-sm ring-1 ring-black/5 md:p-10">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-600">Wellness dashboard</div>
          <h1 className="mt-3 max-w-2xl text-5xl font-bold tracking-tight text-emerald-950 md:text-6xl">Sign in to sync your habits, tasks, expenses, and journal across devices.</h1>
          <p className="mt-5 max-w-2xl text-lg text-zinc-700">
            Once you sign in with the same account on your phone and laptop, your dashboard data will load from the cloud instead of staying trapped in one browser.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="homepage-inner-card rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">Sync</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-950">Cross-device</div>
              <div className="mt-2 text-zinc-700">Open the same account on your phone and laptop.</div>
            </div>
            <div className="homepage-inner-card rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">Storage</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-950">Private</div>
              <div className="mt-2 text-zinc-700">Each signed-in user only sees their own dashboard state.</div>
            </div>
            <div className="homepage-inner-card rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">Migration</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-950">Automatic</div>
              <div className="mt-2 text-zinc-700">Existing local data is uploaded the first time you sign in on a device.</div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/70 bg-white/95 p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex gap-2 rounded-full bg-zinc-100 p-1">
            <button onClick={() => setMode("signin")} className={`flex-1 rounded-full px-4 py-2 font-semibold ${mode === "signin" ? "bg-zinc-950 text-white" : "text-zinc-700"}`}>
              Sign in
            </button>
            <button onClick={() => setMode("signup")} className={`flex-1 rounded-full px-4 py-2 font-semibold ${mode === "signup" ? "bg-zinc-950 text-white" : "text-zinc-700"}`}>
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <div className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Email</div>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-2xl border border-zinc-200 px-4 py-3"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Password</div>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="w-full rounded-2xl border border-zinc-200 px-4 py-3"
                placeholder="At least 6 characters"
              />
            </label>

            {message ? <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">{message}</div> : null}

            <button type="submit" disabled={busy} className="w-full rounded-[1.2rem] bg-emerald-600 px-5 py-3 text-lg font-semibold text-white shadow-md shadow-emerald-500/15 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70">
              {busy ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function DashboardShell({ initialData, onSnapshotChange, syncStatus, userEmail, onSignOut, isCloudEnabled }) {
  const [habits, setHabits] = useState(() => initialData.habits);
  const [tasks, setTasks] = useState(() => initialData.tasks);
  const [expenses, setExpenses] = useState(() => initialData.expenses);
  const [expenseCategories, setExpenseCategories] = useState(() => initialData.expenseCategories);
  const [journalEntries, setJournalEntries] = useState(() => initialData.journalEntries);
  const [journalFolders, setJournalFolders] = useState(() => initialData.journalFolders);
  const [workoutPlans, setWorkoutPlans] = useState(() => initialData.workoutPlans);
  const [workoutFolders, setWorkoutFolders] = useState(() => initialData.workoutFolders);
  const [activeSection, setActiveSection] = useState("dashboard");
  const calendarUrl = "https://calendar.google.com/";

  const resetHabits = () => setHabits([]);
  const resetTasks = () => setTasks([]);
  const resetExpenses = () => {
    setExpenses([]);
    setExpenseCategories(initialExpenseCategories);
  };
  const resetJournal = () => {
    setJournalEntries([]);
    setJournalFolders([]);
  };
  const resetWorkouts = () => {
    setWorkoutPlans([]);
    setWorkoutFolders([]);
  };

  useEffect(() => {
    const snapshot = {
      habits,
      tasks,
      expenses,
      expenseCategories,
      journalEntries,
      journalFolders,
      workoutPlans,
      workoutFolders,
    };
    persistLocalDashboardState(snapshot);
    onSnapshotChange?.(snapshot);
  }, [expenseCategories, expenses, habits, journalEntries, journalFolders, onSnapshotChange, tasks, workoutFolders, workoutPlans]);

  const syncBadge = <SyncBadge syncStatus={syncStatus} userEmail={userEmail} onSignOut={onSignOut} isCloudEnabled={isCloudEnabled} />;

  if (activeSection === "habits") {
    return (
      <>
        {syncBadge}
        <HabitPanel habits={habits} setHabits={setHabits} onBack={() => setActiveSection("dashboard")} onReset={resetHabits} />
      </>
    );
  }
  if (activeSection === "tasks") {
    return (
      <>
        {syncBadge}
        <TodoPanel tasks={tasks} setTasks={setTasks} onBack={() => setActiveSection("dashboard")} onReset={resetTasks} />
      </>
    );
  }
  if (activeSection === "expenses") {
    return (
      <>
        {syncBadge}
        <ExpensePanel expenses={expenses} setExpenses={setExpenses} categories={expenseCategories} setCategories={setExpenseCategories} onBack={() => setActiveSection("dashboard")} onReset={resetExpenses} />
      </>
    );
  }
  if (activeSection === "journal") {
    return (
      <>
        {syncBadge}
        <JournalPanel entries={journalEntries} setEntries={setJournalEntries} folders={journalFolders} setFolders={setJournalFolders} onBack={() => setActiveSection("dashboard")} onReset={resetJournal} />
      </>
    );
  }
  if (activeSection === "workouts") {
    return (
      <>
        {syncBadge}
        <WorkoutPanel plans={workoutPlans} setPlans={setWorkoutPlans} folders={workoutFolders} setFolders={setWorkoutFolders} onBack={() => setActiveSection("dashboard")} onReset={resetWorkouts} />
      </>
    );
  }
  if (activeSection === "calendar") {
    return (
      <>
        {syncBadge}
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),transparent_25%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
          <div className="mx-auto max-w-5xl space-y-8">
            <SectionHeader title="Google Calendar" color="bg-sky-500" onBack={() => setActiveSection("dashboard")} />
            <div className="rounded-[2rem] border border-white/70 bg-white/95 p-8 shadow-sm ring-1 ring-black/5">
              <div className="text-2xl font-semibold text-zinc-950">Open Google Calendar</div>
              <div className="mt-3 text-lg text-zinc-700">Launch your calendar in a new tab to review your schedule, deadlines, and training blocks.</div>
              <button onClick={() => window.open(calendarUrl, "_blank", "noopener,noreferrer")} className="mt-6 rounded-full bg-sky-500 px-6 py-3 text-lg font-semibold text-white hover:bg-sky-600">
                Open gcal
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {syncBadge}
      <DashboardHome habits={habits} tasks={tasks} expenses={expenses} workoutPlans={workoutPlans} onOpenSection={setActiveSection} calendarUrl={calendarUrl} />
    </>
  );
}

function LoadingScreen({ message }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),transparent_22%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 text-center">
      <div className="rounded-[2rem] border border-white/70 bg-white/95 px-8 py-10 shadow-sm ring-1 ring-black/5">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-600">Wellness dashboard</div>
        <div className="mt-3 text-3xl font-semibold text-zinc-950">{message}</div>
      </div>
    </div>
  );
}

export default function StabilityDashboardApp() {
  const [session, setSession] = useState(null);
  const [shellKey, setShellKey] = useState(0);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [syncStatus, setSyncStatus] = useState(hasSupabaseConfig ? "Checking your account..." : "Supabase is not configured yet. The app is still saving on this device only.");
  const [initialData, setInitialData] = useState(() => loadLocalDashboardState());
  const [pendingSnapshot, setPendingSnapshot] = useState(() => loadLocalDashboardState());
  const skipNextSaveRef = useRef(true);
  const saveTimeoutRef = useRef(null);
  const currentUserId = session?.user?.id ?? null;

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) return undefined;

    let isMounted = true;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setLoading(false);
      return;
    }

    if (!session?.user) {
      setSyncStatus("Sign in to enable cloud sync across devices.");
      return;
    }

    let ignore = false;

    const loadCloudState = async () => {
      setLoading(true);
      setSyncStatus("Loading your cloud dashboard...");

      const localState = loadLocalDashboardState();
      const { data, error } = await supabase
        .from(DASHBOARD_STATE_TABLE)
        .select("payload")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (ignore) return;

      if (error) {
        setSyncStatus(`Cloud sync error: ${error.message}`);
        setLoading(false);
        return;
      }

      const nextState = data?.payload ? normalizeDashboardState(data.payload) : localState;

      const needsCloudRewrite = !data?.payload || JSON.stringify(nextState) !== JSON.stringify(data.payload);

      if (needsCloudRewrite) {
        const { error: upsertError } = await supabase.from(DASHBOARD_STATE_TABLE).upsert({
          user_id: session.user.id,
          payload: nextState,
          updated_at: new Date().toISOString(),
        });

        if (ignore) return;

        if (upsertError) {
          setSyncStatus(`Cloud sync error: ${upsertError.message}`);
          setLoading(false);
          return;
        }
      }

      skipNextSaveRef.current = true;
      setInitialData(nextState);
      setPendingSnapshot(nextState);
      setShellKey((current) => current + 1);
      setSyncStatus("Synced to cloud.");
      setLoading(false);
    };

    loadCloudState();

    return () => {
      ignore = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase || !session?.user || loading) return undefined;
    if (!pendingSnapshot) return undefined;

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return undefined;
    }

    clearTimeout(saveTimeoutRef.current);
    setSyncStatus("Saving changes...");

    saveTimeoutRef.current = setTimeout(async () => {
      const { error } = await supabase.from(DASHBOARD_STATE_TABLE).upsert({
        user_id: session.user.id,
        payload: pendingSnapshot,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        setSyncStatus(`Cloud sync error: ${error.message}`);
        return;
      }

      setSyncStatus("All changes synced.");
    }, SAVE_DEBOUNCE_MS);

    return () => {
      clearTimeout(saveTimeoutRef.current);
    };
  }, [loading, pendingSnapshot, session]);

  if (!hasSupabaseConfig) {
    return (
      <DashboardShell
        key={shellKey}
        initialData={initialData}
        onSnapshotChange={setPendingSnapshot}
        syncStatus={syncStatus}
        userEmail={null}
        onSignOut={null}
        isCloudEnabled={false}
      />
    );
  }

  if (loading) {
    return <LoadingScreen message="Connecting your dashboard..." />;
  }

  if (!session?.user) {
    return <AuthScreen />;
  }

  return (
    <DashboardShell
      key={shellKey}
      initialData={initialData}
      onSnapshotChange={setPendingSnapshot}
      syncStatus={syncStatus}
      userEmail={session.user.email ?? "Signed in"}
      onSignOut={() => supabase.auth.signOut()}
      isCloudEnabled
    />
  );
}


