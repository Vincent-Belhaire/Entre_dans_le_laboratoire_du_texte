/*
  Séance 6 — Writer : laboratoire du texte
  Application autonome, sans compte ni serveur.
  Toute la progression est enregistrée dans localStorage sur l'appareil utilisé.
*/

(() => {
  "use strict";

  const STORAGE_KEY = "tice6e-writer-seance6-v1";
  const REQUIRED_STEPS = 7;
  const MAX_PER_SKILL = 1000;
  const MAX_BONUS = 400;

  const skillDefinitions = [
    { key: "selection", icon: "⌖", name: "Sélectionner du texte", detail: "Mot, phrase, texte entier et Ctrl+A" },
    { key: "styles", icon: "G", name: "Mettre en valeur", detail: "Gras, italique et souligné" },
    { key: "appearance", icon: "A", name: "Modifier l’apparence", detail: "Police, taille et couleur" },
    { key: "alignment", icon: "≡", name: "Aligner un texte", detail: "Gauche, centré, droite et justifié" },
    { key: "repair", icon: "🔧", name: "Organiser un document", detail: "Titre, paragraphe et mot important" },
    { key: "shortcuts", icon: "⌨", name: "Utiliser les raccourcis", detail: "Ctrl+A, C, V, Z et S" },
    { key: "final", icon: "★", name: "Reproduire un modèle", detail: "Appliquer une consigne complète" }
  ];

  const defaultSkills = () => Object.fromEntries(skillDefinitions.map(({ key }) => [key, {
    score: 0,
    errors: 0,
    attempts: 0,
    helps: 0,
    completed: false
  }]));

  const defaultState = () => ({
    version: 1,
    currentScreen: "welcome",
    highestStep: 0,
    startTime: null,
    finishedAt: null,
    firstName: "",
    lastName: "",
    className: "",
    skills: defaultSkills(),
    bonusScore: 0,
    bonusCompleted: false
  });

  let state = loadState();
  let currentHelpKey = "general";
  let toastTimer = null;
  let selectionRound = 0;
  let isSelecting = false;
  let selectionAnchor = 0;
  let selectionDragged = false;
  let ignoreSelectionClickUntil = 0;
  let selectedTokenIndexes = new Set();
  let styleRound = 0;
  let appearanceRound = 0;
  let alignmentRound = 0;
  let shortcutRound = 0;
  let repairSelection = "title";
  let finalSelection = "title";
  let bonusRound = 0;
  let bonusSeconds = 45;
  let bonusTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /*
    Mélange les réponses avec l’algorithme de Fisher-Yates.
    L’ordre précédent et la position précédente de la bonne réponse sont mémorisés
    pour éviter qu’une nouvelle question reproduise exactement la même disposition.
    Les barres d’outils Writer, elles, restent fixes comme dans le vrai logiciel.
  */
  const answerLayouts = {};

  function shuffleArray(values) {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
  }

  function variedOrder(values, getValue, correctValue, layoutKey) {
    let shuffled = shuffleArray(values);
    const previous = answerLayouts[layoutKey];
    const signature = list => list.map(getValue).join("|");

    if (previous && signature(shuffled) === previous.signature) {
      shuffled.push(shuffled.shift());
    }

    let correctIndex = shuffled.findIndex(item => getValue(item) === correctValue);
    if (previous && shuffled.length > 1 && correctIndex === previous.correctIndex) {
      const swapIndex = (correctIndex + 1) % shuffled.length;
      [shuffled[correctIndex], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[correctIndex]];
      correctIndex = swapIndex;
    }

    answerLayouts[layoutKey] = { signature: signature(shuffled), correctIndex };
    return shuffled;
  }

  function shuffleButtons(containerSelector, dataName, correctValue, layoutKey) {
    const container = $(containerSelector);
    const buttons = variedOrder(
      $$("button", container),
      button => button.dataset[dataName],
      correctValue,
      layoutKey
    );
    buttons.forEach(button => container.appendChild(button));
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || saved.version !== 1) return defaultState();
      const base = defaultState();
      return {
        ...base,
        ...saved,
        skills: Object.fromEntries(skillDefinitions.map(({ key }) => [key, { ...base.skills[key], ...(saved.skills?.[key] || {}) }]))
      };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Le site reste utilisable sans stockage. */ }
  }

  function totalScore() {
    return skillDefinitions.reduce((sum, { key }) => sum + state.skills[key].score, 0) + state.bonusScore;
  }

  function requiredScore() {
    return skillDefinitions.reduce((sum, { key }) => sum + state.skills[key].score, 0);
  }

  function statusFor(score) {
    const percent = Math.round(score / MAX_PER_SKILL * 100);
    if (percent >= 80) return { label: "Acquis", className: "acquired" };
    if (percent >= 50) return { label: "En cours", className: "progressing" };
    return { label: "À revoir", className: "reinforce" };
  }

  function showToast(message, penalty = false) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.className = `toast show${penalty ? " penalty" : ""}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = "toast"; }, 2300);
  }

  function setFeedback(id, message, type = "") {
    const box = $(id);
    if (!box) return;
    box.textContent = message;
    box.className = `feedback${type ? ` ${type}` : ""}`;
  }

  function recordAttempt(key, correct) {
    const skill = state.skills[key];
    skill.attempts += 1;
    if (!correct) skill.errors += 1;
    saveState();
  }

  function completeSkill(key) {
    const skill = state.skills[key];
    if (skill.completed) return;
    skill.completed = true;
    skill.score = Math.max(250, MAX_PER_SKILL - (skill.errors * 120) - (skill.helps * 40));
    const step = skillDefinitions.findIndex(item => item.key === key) + 1;
    state.highestStep = Math.max(state.highestStep, step);
    saveState();
    updateMissionBar();
    showToast(`Badge gagné · ${skill.score} points`);
  }

  function useHelp(key) {
    const definition = skillDefinitions.find(item => item.key === key);
    if (definition && !state.skills[key].completed) {
      state.skills[key].helps += 1;
      saveState();
    }
  }

  function screenNumber(screenId) {
    if (screenId.startsWith("challenge")) return Number(screenId.replace("challenge", ""));
    if (screenId === "bonus") return 8;
    if (screenId === "final") return 9;
    return 0;
  }

  function updateMissionBar() {
    const screen = state.currentScreen;
    const number = screenNumber(screen);
    const bar = $("#missionBar");
    bar.hidden = screen === "welcome" || screen === "final";
    if (!bar.hidden) {
      const label = number <= 7 ? `Défi ${number} sur 7` : "Bonus facultatif";
      $("#stepLabel").textContent = label;
      const progress = Math.min(100, number <= 7 ? ((number - 1) / REQUIRED_STEPS) * 100 : 100);
      $("#progressFill").style.width = `${progress}%`;
      $(".progress-track").setAttribute("aria-valuenow", String(Math.round(progress)));
    }
    $("#scoreValue").textContent = totalScore();
  }

  function showScreen(screenId, options = {}) {
    $$(".screen").forEach(screen => screen.classList.toggle("is-active", screen.id === screenId));
    state.currentScreen = screenId;
    if (screenId !== "welcome" && !state.startTime) state.startTime = Date.now();
    saveState();
    updateMissionBar();
    if (!options.keepPosition) window.scrollTo({ top: 0, behavior: "smooth" });
    if (screenId === "final") renderReport();
  }

  function goNext(current) {
    if (current < 7) showScreen(`challenge${current + 1}`);
    else showScreen("bonus");
  }

  function goPrevious(current) {
    showScreen(current > 1 ? `challenge${current - 1}` : "welcome");
  }

  function resetSkill(key) {
    state.skills[key] = { score: 0, errors: 0, attempts: 0, helps: 0, completed: false };
    state.highestStep = Math.max(0, skillDefinitions.filter(item => state.skills[item.key].completed).length);
    saveState();
    updateMissionBar();
  }

  /* ---------- Aides ---------- */
  const helpContent = {
    general: {
      title: "Comment réussir la mission ?",
      html: "<ul><li>Lis la consigne et observe le modèle avant de cliquer.</li><li>Une erreur peut toujours être corrigée.</li><li>Le bouton <strong>Fiche tuto</strong> rappelle les gestes sans quitter le défi.</li><li>Ta progression est sauvegardée uniquement sur cet ordinateur.</li></ul>"
    },
    selection: {
      title: "Sélectionner sans se tromper",
      html: "<ol><li>Un <strong>clic simple</strong> place seulement le curseur : aucun texte n’est sélectionné.</li><li>Un <strong>double-clic</strong> sélectionne un mot entier.</li><li>Un <strong>triple-clic</strong> sélectionne une phrase entière.</li><li>Pour choisir une portion précise, maintiens le bouton de la souris et <strong>glisse</strong> du premier au dernier mot.</li><li><kbd>Ctrl</kbd> + <kbd>A</kbd> sélectionne tout le document.</li></ol><p>Le texte sélectionné apparaît sur fond bleu. Le trait vertical qui clignote est le <strong>curseur</strong> : il indique où le texte sera écrit, mais ce n’est pas une sélection.</p>"
    },
    styles: {
      title: "Gras, italique, souligné",
      html: "<ul><li><strong>Gras (G)</strong> : attire l’attention, utile pour un titre ou un mot important.</li><li><em>Italique (I)</em> : souvent utilisé pour un titre d’œuvre ou un mot étranger.</li><li><u>Souligné (S)</u> : à utiliser seulement si la consigne le demande ; sur le Web il ressemble à un lien.</li></ul><p>Dans Writer, clique d’abord dans le texte ou sélectionne-le, puis clique sur l’icône.</p>"
    },
    appearance: {
      title: "Police, taille et couleur",
      html: "<ol><li>Sélectionne le texte à modifier.</li><li>Choisis la <strong>police</strong> dans le menu portant son nom.</li><li>Choisis une <strong>taille</strong> en points (pt).</li><li>Choisis la couleur avec l’icône <strong>A</strong> soulignée de couleur.</li></ol><p>Pour un document lisible : titre 18 à 24 pt, texte courant autour de 11 ou 12 pt.</p>"
    },
    alignment: {
      title: "Les quatre alignements",
      html: "<ul><li><strong>Gauche</strong> : bord gauche régulier, texte courant.</li><li><strong>Centré</strong> : titre ou courte information.</li><li><strong>Droite</strong> : date ou signature.</li><li><strong>Justifié</strong> : bords gauche et droit réguliers, paragraphe soigné.</li></ul>"
    },
    repair: {
      title: "Fiche modèle — document réparé",
      html: "<ul><li>Titre « Le volcan mystérieux » : <strong>20 pt, gras, centré</strong>.</li><li>Paragraphe : <strong>12 pt, justifié</strong>.</li><li>Mot « lave » : <strong>rouge</strong>.</li></ul><p>Clique toujours sur la zone à modifier avant d’utiliser la barre d’outils.</p>"
    },
    shortcuts: {
      title: "Les raccourcis de secours",
      html: "<ul><li><kbd>Ctrl</kbd> + <kbd>A</kbd> : tout sélectionner</li><li><kbd>Ctrl</kbd> + <kbd>C</kbd> : copier</li><li><kbd>Ctrl</kbd> + <kbd>V</kbd> : coller</li><li><kbd>Ctrl</kbd> + <kbd>Z</kbd> : annuler la dernière action</li><li><kbd>Ctrl</kbd> + <kbd>S</kbd> : sauvegarder / enregistrer</li></ul>"
    },
    final: {
      title: "Méthode pour reproduire un modèle",
      html: "<ol><li>Repère les différentes zones : titre, paragraphe, mot particulier.</li><li>Sélectionne une seule zone.</li><li>Applique tous ses réglages avant de passer à la suivante.</li><li>Compare au modèle puis clique sur <strong>Valider par critères</strong>.</li><li>Corrige uniquement les critères encore vides.</li></ol>"
    }
  };

  function openHelp(key = "general") {
    currentHelpKey = key;
    if (key !== "general") useHelp(key);
    const content = helpContent[key] || helpContent.general;
    $("#helpTitle").textContent = content.title;
    $("#helpContent").innerHTML = content.html;
    $("#helpDialog").showModal();
  }

  /* ---------- Défi 1 : sélection ---------- */
  const selectionTasks = [
    { words: ["Pixel", "observe", "le", "texte", "mystérieux", "dans", "Writer."], expected: [3], prompt: "Sélectionne seulement le mot « texte » avec un double-clic (ou un glissement précis)." },
    { words: ["Le", "titre", "annonce", "clairement.", "Le", "paragraphe", "développe", "le", "sujet."], sentences: [0, 0, 0, 0, 1, 1, 1, 1, 1], expected: [0, 1, 2, 3], prompt: "Sélectionne la phrase « Le titre annonce clairement. » avec un triple-clic (ou par glissement)." },
    { words: ["Writer", "permet", "de", "mettre", "en", "forme", "un", "document", "complet."], expected: "all", prompt: "Sélectionne tout le texte avec Ctrl+A (ou en glissant sur tous les mots)." }
  ];

  function renderSelectionTask() {
    const task = selectionTasks[selectionRound];
    selectedTokenIndexes.clear();
    $("#selectionStep").textContent = String(selectionRound + 1);
    $("#selectionLabel").textContent = ["MANCHE 1 · DOUBLE-CLIC OU GLISSE", "MANCHE 2 · TRIPLE-CLIC OU GLISSE", "MANCHE 3 · RACCOURCI OU GLISSE"][selectionRound];
    $("#selectionPrompt").textContent = task.prompt;
    $("#selectionText").innerHTML = task.words.map((word, index) => `<span class="word-token" data-token="${index}" data-sentence="${task.sentences?.[index] ?? 0}">${word}</span>${index < task.words.length - 1 ? " " : ""}`).join("");
    const guidance = [
      "Un clic simple place seulement le curseur. Double-clique sur le mot ou glisse précisément dessus.",
      "Triple-clique dans la première phrase ou glisse de son premier à son dernier mot.",
      "Clique dans la feuille puis appuie sur Ctrl+A, ou glisse sur tout le texte."
    ];
    setFeedback("#selectionFeedback", guidance[selectionRound]);
  }

  function updateSelectionTokens() {
    $$(".word-token", $("#selectionText")).forEach((token, index) => {
      token.classList.toggle("selected", selectedTokenIndexes.has(index));
      token.classList.remove("cursor");
    });
  }

  function selectTokenRange(from, to) {
    selectedTokenIndexes.clear();
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    for (let i = start; i <= end; i += 1) selectedTokenIndexes.add(i);
    updateSelectionTokens();
  }

  function placeSelectionCursor(index) {
    selectedTokenIndexes.clear();
    updateSelectionTokens();
    const token = $(`.word-token[data-token="${index}"]`, $("#selectionText"));
    token?.classList.add("cursor");
  }

  function selectSentence(sentenceIndex) {
    selectedTokenIndexes.clear();
    $$(".word-token", $("#selectionText")).forEach((token, index) => {
      if (Number(token.dataset.sentence) === sentenceIndex) selectedTokenIndexes.add(index);
    });
    updateSelectionTokens();
  }

  function validateSelection() {
    const task = selectionTasks[selectionRound];
    const expected = task.expected === "all" ? task.words.map((_, i) => i) : task.expected;
    const actual = [...selectedTokenIndexes].sort((a, b) => a - b);
    const correct = expected.length === actual.length && expected.every((value, i) => value === actual[i]);
    recordAttempt("selection", correct);
    if (!correct) {
      setFeedback("#selectionFeedback", actual.length === 0 ? "Ce trait est seulement le curseur. Il faut faire apparaître un fond bleu sur le texte demandé." : "La sélection est trop courte ou trop longue. Repars du premier mot demandé et arrête-toi au dernier.", "error");
      showToast("Sélection à ajuster", true);
      return;
    }
    setFeedback("#selectionFeedback", "Exact ! Tu as sélectionné uniquement la bonne portion de texte.", "success");
    if (selectionRound < selectionTasks.length - 1) {
      selectionRound += 1;
      setTimeout(renderSelectionTask, 650);
    } else {
      completeSkill("selection");
      $("#selectionNext").disabled = false;
    }
  }

  function initSelection(reset = false) {
    if (reset) resetSkill("selection");
    selectionRound = 0;
    $("#selectionNext").disabled = !state.skills.selection.completed;
    renderSelectionTask();
  }

  /* ---------- Défi 2 : styles ---------- */
  const styleTasks = [
    { context: "Dans un document scolaire…", question: "Quelle mise en forme convient le mieux au titre principal ?", answer: "bold", why: "Le gras donne au titre une hiérarchie claire." },
    { context: "Tu cites un roman…", question: "Comment présenter le titre Le Petit Prince ?", answer: "italic", why: "Un titre d’œuvre se met généralement en italique." },
    { context: "Une consigne précise de souligner…", question: "Quelle icône de Writer faut-il choisir ?", answer: "underline", why: "Dans Writer en français, le S souligné active le soulignement." },
    { context: "Dans un paragraphe…", question: "Comment faire ressortir un mot vraiment important ?", answer: "bold", why: "Le gras attire l’œil sans surcharger le document." },
    { context: "Pour le texte courant…", question: "Faut-il mettre toute une longue phrase en gras, italique ou souligné ?", answer: "none", why: "Le texte courant reste en style normal pour être facile à lire." }
  ];

  function renderStyleTask() {
    const task = styleTasks[styleRound];
    $("#styleCount").textContent = `Question ${styleRound + 1} / ${styleTasks.length}`;
    $("#styleContext").textContent = task.context;
    $("#styleQuestion").textContent = task.question;
    $$("#styleAnswers button").forEach(button => { button.disabled = false; button.classList.remove("correct", "wrong"); });
    shuffleButtons("#styleAnswers", "style", task.answer, "styles");
  }

  function answerStyle(button) {
    const task = styleTasks[styleRound];
    const correct = button.dataset.style === task.answer;
    recordAttempt("styles", correct);
    button.classList.add(correct ? "correct" : "wrong");
    if (!correct) {
      setFeedback("#styleFeedback", "Pas tout à fait. Demande-toi si tu veux attirer l’attention, citer une œuvre ou suivre une consigne précise.", "error");
      return;
    }
    setFeedback("#styleFeedback", `Bravo ! ${task.why}`, "success");
    $$("#styleAnswers button").forEach(item => { item.disabled = true; });
    if (styleRound < styleTasks.length - 1) {
      styleRound += 1;
      setTimeout(renderStyleTask, 700);
    } else {
      completeSkill("styles");
      $("#styleNext").disabled = false;
    }
  }

  function initStyles(reset = false) {
    if (reset) resetSkill("styles");
    styleRound = 0;
    $("#styleNext").disabled = !state.skills.styles.completed;
    renderStyleTask();
  }

  /* ---------- Défi 3 : apparence ---------- */
  const appearanceTasks = [
    { font: "Liberation Sans", size: "18", color: "purple", text: "Le club des explorateurs", prompt: "Mets le texte en Liberation Sans, 18 pt et violet." },
    { font: "Liberation Serif", size: "12", color: "ink", text: "Compte rendu de l’expérience", prompt: "Mets le texte en Liberation Serif, 12 pt et noir." },
    { font: "Carlito", size: "20", color: "blue", text: "Résultats du laboratoire", prompt: "Mets le texte en Carlito, 20 pt et bleu." }
  ];
  const colorMap = { ink: "#2c2a4a", purple: "#6c63ff", blue: "#3d8beb", coral: "#ff5d73", teal: "#168f7b" };

  function applyAppearancePreview() {
    const target = $("#appearanceTarget");
    target.style.fontFamily = `"${$("#fontSelect").value}", Arial, sans-serif`;
    target.style.fontSize = `${$("#sizeSelect").value}pt`;
    target.style.color = colorMap[$("#colorSelect").value];
    updateCriteria("#appearanceCriteria", [
      [$("#fontSelect").value === appearanceTasks[appearanceRound].font, `Police : ${appearanceTasks[appearanceRound].font}`],
      [$("#sizeSelect").value === appearanceTasks[appearanceRound].size, `Taille : ${appearanceTasks[appearanceRound].size} pt`],
      [$("#colorSelect").value === appearanceTasks[appearanceRound].color, `Couleur : ${colorLabel(appearanceTasks[appearanceRound].color)}`]
    ]);
  }

  function colorLabel(key) {
    return ({ ink: "noir", purple: "violet", blue: "bleu", coral: "rouge", teal: "vert" })[key];
  }

  function renderAppearanceTask() {
    const task = appearanceTasks[appearanceRound];
    $("#appearancePrompt").textContent = `${appearanceRound + 1}/3 — ${task.prompt}`;
    $("#appearanceTarget").textContent = task.text;
    $("#fontSelect").value = "Liberation Sans";
    $("#sizeSelect").value = "12";
    $("#colorSelect").value = "ink";
    applyAppearancePreview();
    setFeedback("#appearanceFeedback", "La sélection bleue indique la zone qui recevra la mise en forme.");
  }

  function validateAppearance() {
    const task = appearanceTasks[appearanceRound];
    const checks = [$("#fontSelect").value === task.font, $("#sizeSelect").value === task.size, $("#colorSelect").value === task.color];
    const correct = checks.every(Boolean);
    recordAttempt("appearance", correct);
    if (!correct) {
      const missing = [!checks[0] && "la police", !checks[1] && "la taille", !checks[2] && "la couleur"].filter(Boolean).join(", ");
      setFeedback("#appearanceFeedback", `Encore un réglage : vérifie ${missing}. Les critères validés restent cochés.`, "error");
      return;
    }
    setFeedback("#appearanceFeedback", "Mise en forme identique à la consigne !", "success");
    if (appearanceRound < appearanceTasks.length - 1) {
      appearanceRound += 1;
      setTimeout(renderAppearanceTask, 700);
    } else {
      completeSkill("appearance");
      $("#appearanceNext").disabled = false;
    }
  }

  function initAppearance(reset = false) {
    if (reset) resetSkill("appearance");
    appearanceRound = 0;
    $("#appearanceNext").disabled = !state.skills.appearance.completed;
    renderAppearanceTask();
  }

  /* ---------- Défi 4 : alignement ---------- */
  const alignmentTasks = [
    { prompt: "Un titre principal doit être centré.", answer: "center", text: "Le laboratoire du texte" },
    { prompt: "Un paragraphe d’article doit avoir deux bords réguliers.", answer: "justify", text: "Writer permet de présenter un texte de façon claire et organisée pour faciliter sa lecture." },
    { prompt: "Une date placée en haut d’une lettre doit être à droite.", answer: "right", text: "Paris, le 12 septembre" },
    { prompt: "Le texte courant d’une courte liste commence au bord gauche.", answer: "left", text: "Matériel : ordinateur, clavier et souris" }
  ];

  function renderAlignmentTask() {
    const task = alignmentTasks[alignmentRound];
    $("#alignPrompt").textContent = `${alignmentRound + 1}/4 — ${task.prompt}`;
    $("#alignTarget").textContent = task.text;
    $("#alignTarget").style.textAlign = "left";
    $$("#alignmentToolbar button").forEach(button => button.classList.remove("on"));
    setFeedback("#alignFeedback", "Observe l’icône puis clique sur le bon bouton d’alignement.");
  }

  function answerAlignment(button) {
    const chosen = button.dataset.align;
    const task = alignmentTasks[alignmentRound];
    $("#alignTarget").style.textAlign = chosen;
    $$("#alignmentToolbar button").forEach(item => item.classList.toggle("on", item === button));
    const correct = chosen === task.answer;
    recordAttempt("alignment", correct);
    if (!correct) {
      setFeedback("#alignFeedback", "Ce bouton déplace le texte, mais pas comme le demande la situation. Compare les bords des lignes.", "error");
      return;
    }
    setFeedback("#alignFeedback", `Exact : ${colorAlignment(chosen)}.`, "success");
    if (alignmentRound < alignmentTasks.length - 1) {
      alignmentRound += 1;
      setTimeout(renderAlignmentTask, 700);
    } else {
      completeSkill("alignment");
      $("#alignNext").disabled = false;
    }
  }

  function colorAlignment(value) {
    return ({ left: "aligné à gauche", center: "centré", right: "aligné à droite", justify: "justifié" })[value];
  }

  function initAlignment(reset = false) {
    if (reset) resetSkill("alignment");
    alignmentRound = 0;
    $("#alignNext").disabled = !state.skills.alignment.completed;
    renderAlignmentTask();
  }

  /* ---------- Défi 5 : réparation ---------- */
  let repairModel = {};
  const repairCriteria = [
    ["titleSize", "Titre en 20 pt"], ["titleBold", "Titre en gras"], ["titleCenter", "Titre centré"],
    ["paragraphSize", "Paragraphe en 12 pt"], ["paragraphJustify", "Paragraphe justifié"], ["wordRed", "Mot « lave » en rouge"]
  ];

  function resetRepairModel() {
    repairModel = { titleSize: 12, titleBold: false, titleCenter: false, paragraphSize: 16, paragraphJustify: false, wordRed: false };
    repairSelection = "title";
    renderRepair();
  }

  function renderRepair() {
    const title = $("#repairTitle");
    const paragraph = $("#repairParagraph");
    const word = $("#repairWord");
    title.style.fontSize = `${repairModel.titleSize}pt`;
    title.style.fontWeight = repairModel.titleBold ? "700" : "400";
    title.style.textAlign = repairModel.titleCenter ? "center" : "left";
    paragraph.style.fontSize = `${repairModel.paragraphSize}pt`;
    paragraph.style.textAlign = repairModel.paragraphJustify ? "justify" : "left";
    word.style.color = repairModel.wordRed ? colorMap.coral : "inherit";
    $$('[data-repair-part]').forEach(item => item.classList.toggle("is-selected", item.dataset.repairPart === repairSelection));
    $("#repairToolbar select").value = repairSelection === "title" ? String(repairModel.titleSize) : repairSelection === "paragraph" ? String(repairModel.paragraphSize) : "12";
    $("#repairToolbar [data-tool='bold']").classList.toggle("on", repairSelection === "title" && repairModel.titleBold);
    $("#repairToolbar [data-tool='center']").classList.toggle("on", repairSelection === "title" && repairModel.titleCenter);
    $("#repairToolbar [data-tool='justify']").classList.toggle("on", repairSelection === "paragraph" && repairModel.paragraphJustify);
    $("#repairToolbar [data-tool='red']").classList.toggle("on", repairSelection === "word" && repairModel.wordRed);
    $("#repairChecklist").innerHTML = repairCriteria.map(([key, label]) => `<li class="${repairModel[key] === true || repairModel[key] === 20 || repairModel[key] === 12 ? "ok" : ""}">${label}</li>`).join("");
  }

  function applyRepairTool(tool, value) {
    if (tool === "size") {
      if (repairSelection === "title") repairModel.titleSize = Number(value);
      if (repairSelection === "paragraph") repairModel.paragraphSize = Number(value);
    }
    if (tool === "bold" && repairSelection === "title") repairModel.titleBold = !repairModel.titleBold;
    if (tool === "center" && repairSelection === "title") repairModel.titleCenter = !repairModel.titleCenter;
    if (tool === "justify" && repairSelection === "paragraph") repairModel.paragraphJustify = !repairModel.paragraphJustify;
    if (tool === "red" && repairSelection === "word") repairModel.wordRed = !repairModel.wordRed;
    renderRepair();
  }

  function validateRepair() {
    const checks = {
      titleSize: repairModel.titleSize === 20,
      titleBold: repairModel.titleBold,
      titleCenter: repairModel.titleCenter,
      paragraphSize: repairModel.paragraphSize === 12,
      paragraphJustify: repairModel.paragraphJustify,
      wordRed: repairModel.wordRed
    };
    const missing = repairCriteria.filter(([key]) => !checks[key]);
    const correct = missing.length === 0;
    recordAttempt("repair", correct);
    if (!correct) {
      state.skills.repair.errors += Math.max(0, missing.length - 1);
      saveState();
      setFeedback("#repairFeedback", `${6 - missing.length}/6 réglages corrects. À corriger : ${missing.map(([, label]) => label.toLowerCase()).join(", ")}.`, "error");
      return;
    }
    setFeedback("#repairFeedback", "Document réparé : le titre ressort, le paragraphe est lisible et le mot important est coloré.", "success");
    completeSkill("repair");
    $("#repairNext").disabled = false;
  }

  function initRepair(reset = false) {
    if (reset) resetSkill("repair");
    $("#repairNext").disabled = !state.skills.repair.completed;
    resetRepairModel();
    setFeedback("#repairFeedback", "Commence par cliquer sur un élément du document.");
  }

  /* ---------- Défi 6 : raccourcis ---------- */
  const shortcutTasks = [
    { icon: "🔎", text: "Tu veux sélectionner tout le document.", answer: "a", why: "Ctrl+A sélectionne tout." },
    { icon: "📋", text: "Tu veux garder une copie du texte sélectionné en mémoire.", answer: "c", why: "Ctrl+C copie la sélection." },
    { icon: "📥", text: "Tu veux insérer ici le texte que tu viens de copier.", answer: "v", why: "Ctrl+V colle le contenu copié." },
    { icon: "↶", text: "Tu as supprimé une phrase par erreur.", answer: "z", why: "Ctrl+Z annule la dernière action." },
    { icon: "💾", text: "Tu viens de terminer ton travail et tu veux l’enregistrer.", answer: "s", why: "Ctrl+S sauvegarde le document." }
  ];

  function renderShortcutTask() {
    const task = shortcutTasks[shortcutRound];
    $("#shortcutIcon").textContent = task.icon;
    $("#shortcutContext").textContent = `${shortcutRound + 1}/5 — ${task.text}`;
    $$("#shortcutAnswers button").forEach(button => { button.disabled = false; button.classList.remove("correct", "wrong"); });
    shuffleButtons("#shortcutAnswers", "shortcut", task.answer, "shortcuts");
  }

  function answerShortcut(button) {
    const task = shortcutTasks[shortcutRound];
    const correct = button.dataset.shortcut === task.answer;
    recordAttempt("shortcuts", correct);
    button.classList.add(correct ? "correct" : "wrong");
    if (!correct) {
      setFeedback("#shortcutFeedback", "Ce raccourci réalise une autre action. Lis le petit mémo sous les touches.", "error");
      return;
    }
    setFeedback("#shortcutFeedback", task.why, "success");
    $$("#shortcutAnswers button").forEach(item => { item.disabled = true; });
    if (shortcutRound < shortcutTasks.length - 1) {
      shortcutRound += 1;
      setTimeout(renderShortcutTask, 650);
    } else {
      completeSkill("shortcuts");
      $("#shortcutNext").disabled = false;
    }
  }

  function initShortcuts(reset = false) {
    if (reset) resetSkill("shortcuts");
    shortcutRound = 0;
    $("#shortcutNext").disabled = !state.skills.shortcuts.completed;
    renderShortcutTask();
  }

  /* ---------- Défi 7 : document final ---------- */
  let finalModel = {};
  const finalCriterionLabels = [
    ["titleFont", "Titre : Liberation Sans"], ["titleSize", "Titre : 20 pt"], ["titleBold", "Titre : gras"], ["titleCenter", "Titre : centré"], ["titleBlue", "Titre : bleu"],
    ["paragraphFont", "Paragraphe : Liberation Serif"], ["paragraphSize", "Paragraphe : 12 pt"], ["paragraphJustify", "Paragraphe : justifié"],
    ["wordItalic", "« fragile » : italique"], ["wordRed", "« fragile » : rouge"]
  ];

  function resetFinalModel() {
    finalModel = {
      titleFont: "Liberation Serif", titleSize: 12, titleBold: false, titleCenter: false, titleColor: "ink",
      paragraphFont: "Liberation Sans", paragraphSize: 12, paragraphJustify: false,
      wordItalic: false, wordColor: "ink"
    };
    finalSelection = "title";
    renderFinalEditor();
  }

  function finalChecks() {
    return {
      titleFont: finalModel.titleFont === "Liberation Sans",
      titleSize: finalModel.titleSize === 20,
      titleBold: finalModel.titleBold,
      titleCenter: finalModel.titleCenter,
      titleBlue: finalModel.titleColor === "blue",
      paragraphFont: finalModel.paragraphFont === "Liberation Serif",
      paragraphSize: finalModel.paragraphSize === 12,
      paragraphJustify: finalModel.paragraphJustify,
      wordItalic: finalModel.wordItalic,
      wordRed: finalModel.wordColor === "coral"
    };
  }

  function renderFinalEditor() {
    const title = $("#finalDocTitle");
    const paragraph = $("#finalDocParagraph");
    const word = $("#finalDocWord");
    title.style.fontFamily = `"${finalModel.titleFont}", Arial, sans-serif`;
    title.style.fontSize = `${finalModel.titleSize}pt`;
    title.style.fontWeight = finalModel.titleBold ? "700" : "400";
    title.style.textAlign = finalModel.titleCenter ? "center" : "left";
    title.style.color = colorMap[finalModel.titleColor];
    paragraph.style.fontFamily = `"${finalModel.paragraphFont}", Georgia, serif`;
    paragraph.style.fontSize = `${finalModel.paragraphSize}pt`;
    paragraph.style.textAlign = finalModel.paragraphJustify ? "justify" : "left";
    word.style.fontStyle = finalModel.wordItalic ? "italic" : "normal";
    word.style.color = colorMap[finalModel.wordColor];
    $$('[data-final-part]').forEach(item => item.classList.toggle("is-selected", item.dataset.finalPart === finalSelection));
    syncFinalToolbar();
    updateCriteria("#finalCriteria", finalCriterionLabels.map(([key, label]) => [finalChecks()[key], label]));
  }

  function syncFinalToolbar() {
    const toolbar = $("#finalToolbar");
    const font = $("[data-final-tool='font']", toolbar);
    const size = $("[data-final-tool='size']", toolbar);
    const color = $("[data-final-tool='color']", toolbar);
    if (finalSelection === "title") {
      font.value = finalModel.titleFont; size.value = String(finalModel.titleSize); color.value = finalModel.titleColor;
    } else if (finalSelection === "paragraph") {
      font.value = finalModel.paragraphFont; size.value = String(finalModel.paragraphSize); color.value = "ink";
    } else {
      font.value = finalModel.paragraphFont; size.value = String(finalModel.paragraphSize); color.value = finalModel.wordColor;
    }
    $("[data-final-tool='bold']", toolbar).classList.toggle("on", finalSelection === "title" && finalModel.titleBold);
    $("[data-final-tool='italic']", toolbar).classList.toggle("on", finalSelection === "word" && finalModel.wordItalic);
    $("[data-final-tool='center']", toolbar).classList.toggle("on", finalSelection === "title" && finalModel.titleCenter);
    $("[data-final-tool='justify']", toolbar).classList.toggle("on", finalSelection === "paragraph" && finalModel.paragraphJustify);
  }

  function applyFinalTool(tool, value) {
    if (tool === "font") {
      if (finalSelection === "title") finalModel.titleFont = value;
      if (finalSelection === "paragraph") finalModel.paragraphFont = value;
    }
    if (tool === "size") {
      if (finalSelection === "title") finalModel.titleSize = Number(value);
      if (finalSelection === "paragraph") finalModel.paragraphSize = Number(value);
    }
    if (tool === "color") {
      if (finalSelection === "title") finalModel.titleColor = value;
      if (finalSelection === "word") finalModel.wordColor = value;
    }
    if (tool === "bold" && finalSelection === "title") finalModel.titleBold = !finalModel.titleBold;
    if (tool === "italic" && finalSelection === "word") finalModel.wordItalic = !finalModel.wordItalic;
    if (tool === "center" && finalSelection === "title") finalModel.titleCenter = !finalModel.titleCenter;
    if (tool === "left" && finalSelection === "title") finalModel.titleCenter = false;
    if (tool === "justify" && finalSelection === "paragraph") finalModel.paragraphJustify = !finalModel.paragraphJustify;
    renderFinalEditor();
  }

  function validateFinalEditor() {
    const checks = finalChecks();
    const missing = finalCriterionLabels.filter(([key]) => !checks[key]);
    const correct = missing.length === 0;
    recordAttempt("final", correct);
    if (!correct) {
      state.skills.final.errors += Math.max(0, Math.ceil(missing.length / 3) - 1);
      saveState();
      setFeedback("#finalFeedback", `${10 - missing.length}/10 critères validés. Corrige les critères encore marqués d’un cercle.`, "error");
      return;
    }
    setFeedback("#finalFeedback", "10/10 critères validés ! Le document reproduit fidèlement le modèle.", "success");
    completeSkill("final");
    $("#toBonus").disabled = false;
  }

  function initFinalEditor(reset = false) {
    if (reset) resetSkill("final");
    $("#toBonus").disabled = !state.skills.final.completed;
    resetFinalModel();
    setFeedback("#finalFeedback", "Sélectionne une zone dans ton document, puis applique les réglages du modèle.");
  }

  function updateCriteria(selector, items) {
    $(selector).innerHTML = items.map(([ok, label]) => `<span class="criterion${ok ? " ok" : ""}">${label}</span>`).join("");
  }

  /* ---------- Bonus ---------- */
  const bonusTasks = [
    { q: "Quel raccourci enregistre le document ?", choices: ["Ctrl+S", "Ctrl+Z", "Ctrl+A", "Ctrl+V"], a: "Ctrl+S" },
    { q: "Quel alignement convient à un titre principal ?", choices: ["Centré", "Droite", "Justifié", "Aucun"], a: "Centré" },
    { q: "Quelle taille est la plus adaptée à un paragraphe ?", choices: ["12 pt", "36 pt", "48 pt", "6 pt"], a: "12 pt" },
    { q: "Comment met-on généralement un titre de roman ?", choices: ["Italique", "Tout en rouge", "Barré", "En exposant"], a: "Italique" },
    { q: "Que fait Ctrl+Z ?", choices: ["Annuler", "Zoomer", "Fermer", "Imprimer"], a: "Annuler" },
    { q: "Avant de mettre un mot en couleur, il faut…", choices: ["Le sélectionner", "Fermer Writer", "L’imprimer", "Le supprimer"], a: "Le sélectionner" }
  ];

  function startBonus() {
    if (bonusTimer) clearInterval(bonusTimer);
    bonusRound = 0;
    bonusSeconds = 45;
    state.bonusScore = 0;
    state.bonusCompleted = false;
    $("#bonusIntro").hidden = true;
    $("#bonusArena").hidden = false;
    $("#timerBadge").textContent = `⏱ ${bonusSeconds} s`;
    renderBonusTask();
    bonusTimer = setInterval(() => {
      bonusSeconds -= 1;
      $("#timerBadge").textContent = `⏱ ${bonusSeconds} s`;
      if (bonusSeconds <= 0) finishBonus("Temps écoulé ! Ton score bonus est conservé.");
    }, 1000);
  }

  function renderBonusTask() {
    const task = bonusTasks[bonusRound];
    const choices = variedOrder(task.choices, choice => choice, task.a, "bonus");
    $("#bonusCount").textContent = `Question ${bonusRound + 1} / ${bonusTasks.length}`;
    $("#bonusQuestion").textContent = task.q;
    $("#bonusAnswers").innerHTML = choices.map(choice => `<button class="answer-button" type="button" data-bonus-answer="${choice}">${choice}</button>`).join("");
  }

  function answerBonus(button) {
    const task = bonusTasks[bonusRound];
    const correct = button.dataset.bonusAnswer === task.a;
    button.classList.add(correct ? "correct" : "wrong");
    if (correct) state.bonusScore += bonusRound === bonusTasks.length - 1 ? 65 : 67;
    saveState();
    if (bonusRound < bonusTasks.length - 1) {
      bonusRound += 1;
      setTimeout(renderBonusTask, 350);
    } else {
      finishBonus("Sprint terminé ! Le bonus a été ajouté à ton bilan.");
    }
  }

  function finishBonus(message) {
    clearInterval(bonusTimer);
    bonusTimer = null;
    state.bonusCompleted = true;
    state.bonusScore = Math.min(MAX_BONUS, state.bonusScore);
    saveState();
    $("#bonusArena").hidden = true;
    $("#bonusIntro").hidden = false;
    $("#bonusStart").textContent = "Rejouer le bonus";
    setFeedback("#bonusFeedback", `${message} Bonus : ${state.bonusScore} / ${MAX_BONUS} points.`, "success");
    updateMissionBar();
  }

  /* ---------- Bilan ---------- */
  function formatDuration() {
    if (!state.startTime) return "—";
    const end = state.finishedAt || Date.now();
    const minutes = Math.max(1, Math.round((end - state.startTime) / 60000));
    return `${minutes} min`;
  }

  function renderReport() {
    if (!state.finishedAt) state.finishedAt = Date.now();
    saveState();
    const max = REQUIRED_STEPS * MAX_PER_SKILL + (state.bonusCompleted ? MAX_BONUS : 0);
    const percent = Math.round(requiredScore() / (REQUIRED_STEPS * MAX_PER_SKILL) * 100);
    const attempts = skillDefinitions.reduce((sum, { key }) => sum + state.skills[key].attempts, 0);
    const helps = skillDefinitions.reduce((sum, { key }) => sum + state.skills[key].helps, 0);
    const acquired = skillDefinitions.filter(({ key }) => statusFor(state.skills[key].score).label === "Acquis");

    $("#reportFirstName").value = state.firstName;
    $("#reportLastName").value = state.lastName;
    $("#reportClass").value = state.className;
    $("#reportDate").textContent = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
    $("#finalScore").textContent = totalScore();
    $("#maxScoreLabel").textContent = ` / ${max}`;
    $("#finalPercent").textContent = `${percent} %`;
    $("#timeSpent").textContent = formatDuration();
    $("#attemptsTotal").textContent = String(attempts);
    $("#helpsTotal").textContent = String(helps);
    $("#validatedCount").textContent = String(acquired.length);

    const stars = percent >= 85 ? 3 : percent >= 65 ? 2 : 1;
    $("#starRow").textContent = `${"★ ".repeat(stars)}${"☆ ".repeat(3 - stars)}`.trim();
    $("#rankBadge").textContent = percent >= 85 ? "Maître du texte" : percent >= 65 ? "Technicien Writer" : "Apprenti du texte";
    $("#finalMessage").textContent = percent >= 85 ? "Pixel te confie le rapport officiel du laboratoire." : percent >= 65 ? "Le rapport est lisible : encore quelques réglages à consolider." : "La mission est terminée : ton bilan montre exactement quoi réviser.";

    $("#reportTableBody").innerHTML = skillDefinitions.map(def => {
      const skill = state.skills[def.key];
      const skillPercent = Math.round(skill.score / MAX_PER_SKILL * 100);
      const status = statusFor(skill.score);
      return `<tr><th><span class="table-icon">${def.icon}</span>${def.name}</th><td>${def.detail}</td><td><strong>${skillPercent} %</strong><br><small>${skill.score} / 1000</small></td><td>${skill.attempts} essai(s)<br>${skill.errors} erreur(s) · ${skill.helps} aide(s)</td><td><span class="level-tag ${status.className}">${status.label}</span></td></tr>`;
    }).join("");

    const validatedItems = acquired.length ? acquired.map(item => `<li>${item.name}</li>`).join("") : "<li>Continue à t’entraîner : la première compétence sera bientôt validée.</li>";
    $("#validatedSkills").innerHTML = validatedItems;
    $("#adviceList").innerHTML = personalizedAdvice().map(advice => `<li>${advice}</li>`).join("");
    $("#knowList").innerHTML = skillDefinitions.map(def => {
      const mastered = statusFor(state.skills[def.key].score).label === "Acquis";
      return `<span class="know-item${mastered ? " mastered" : ""}">${knowStatement(def.key)}</span>`;
    }).join("");
  }

  function personalizedAdvice() {
    const ordered = skillDefinitions.map(def => ({ ...def, ...state.skills[def.key] })).sort((a, b) => a.score - b.score);
    const adviceMap = {
      selection: "Entraîne-toi à sélectionner du premier au dernier caractère avant de mettre en forme.",
      styles: "Retiens : gras pour attirer l’œil, italique pour une œuvre, souligné seulement si demandé.",
      appearance: "Vérifie toujours les trois menus : police, taille puis couleur.",
      alignment: "Observe les bords des lignes : deux bords droits indiquent un texte justifié.",
      repair: "Travaille zone par zone : titre, paragraphe, puis mot important.",
      shortcuts: "Répète les cinq raccourcis sur un vrai document Writer et sauvegarde souvent avec Ctrl+S.",
      final: "Compare le document au modèle critère par critère avant de valider."
    };
    const needsWork = ordered.filter(item => item.score < 800).slice(0, 2);
    if (!needsWork.length) return ["Très bon travail : réutilise ces gestes dans ton prochain document.", "Pense à sauvegarder régulièrement avec Ctrl+S."];
    return [...needsWork.map(item => adviceMap[item.key]), "Une erreur corrigée fait partie de l’apprentissage : recommence les étapes marquées « En cours » ou « À revoir »." ];
  }

  function knowStatement(key) {
    return ({
      selection: "sélectionner précisément un texte",
      styles: "utiliser gras, italique et souligné",
      appearance: "changer police, taille et couleur",
      alignment: "choisir le bon alignement",
      repair: "organiser titre et paragraphe",
      shortcuts: "utiliser cinq raccourcis utiles",
      final: "reproduire une mise en forme complète"
    })[key];
  }

  /* ---------- Événements généraux ---------- */
  $("#startButton").addEventListener("click", () => {
    state.firstName = $("#startFirstName").value.trim();
    state.lastName = $("#startLastName").value.trim();
    state.className = $("#startClass").value.trim();
    if (!state.startTime) state.startTime = Date.now();
    saveState();
    initSelection(false);
    showScreen("challenge1");
  });

  $("#homeButton").addEventListener("click", () => showScreen("welcome"));
  $("#helpButton").addEventListener("click", () => openHelp("general"));
  $("#closeHelp").addEventListener("click", () => $("#helpDialog").close());
  $("#gotItButton").addEventListener("click", () => $("#helpDialog").close());
  $$('[data-help]').forEach(button => button.addEventListener("click", () => openHelp(button.dataset.help)));

  $$('[data-action="home"]').forEach(button => button.addEventListener("click", () => showScreen("welcome")));
  $$('[data-action="previous"]').forEach(button => button.addEventListener("click", () => goPrevious(screenNumber(state.currentScreen))));
  $("#selectionNext").addEventListener("click", () => { initStyles(false); goNext(1); });
  $("#styleNext").addEventListener("click", () => { initAppearance(false); goNext(2); });
  $("#appearanceNext").addEventListener("click", () => { initAlignment(false); goNext(3); });
  $("#alignNext").addEventListener("click", () => { initRepair(false); goNext(4); });
  $("#repairNext").addEventListener("click", () => { initShortcuts(false); goNext(5); });
  $("#shortcutNext").addEventListener("click", () => { initFinalEditor(false); goNext(6); });
  $("#toBonus").addEventListener("click", () => showScreen("bonus"));

  $$('[data-retry]').forEach(button => button.addEventListener("click", () => {
    const number = Number(button.dataset.retry.replace("challenge", ""));
    [initSelection, initStyles, initAppearance, initAlignment, initRepair, initShortcuts, initFinalEditor][number - 1](true);
    showToast("Étape recommencée");
  }));

  /* Sélection à la souris et au clavier. */
  $("#selectionText").addEventListener("pointerdown", event => {
    const token = event.target.closest("[data-token]");
    if (!token) return;
    event.preventDefault();
    isSelecting = true;
    selectionDragged = false;
    selectionAnchor = Number(token.dataset.token);
    placeSelectionCursor(selectionAnchor);
    $("#selectionLab").focus();
  });
  $("#selectionText").addEventListener("pointerover", event => {
    const token = event.target.closest("[data-token]");
    if (!isSelecting || !token) return;
    const index = Number(token.dataset.token);
    selectionDragged = selectionDragged || index !== selectionAnchor;
    selectTokenRange(selectionAnchor, index);
  });
  document.addEventListener("pointerup", () => {
    if (selectionDragged) ignoreSelectionClickUntil = Date.now() + 200;
    isSelecting = false;
    selectionDragged = false;
  });
  $("#selectionText").addEventListener("click", event => {
    const token = event.target.closest("[data-token]");
    if (!token || Date.now() < ignoreSelectionClickUntil) return;
    const tokenIndex = Number(token.dataset.token);

    if (event.detail >= 3) {
      selectSentence(Number(token.dataset.sentence));
      setFeedback("#selectionFeedback", "Triple-clic détecté : la phrase entière est sélectionnée.", "success");
    } else if (event.detail === 2) {
      selectTokenRange(tokenIndex, tokenIndex);
      setFeedback("#selectionFeedback", "Double-clic détecté : le mot entier est sélectionné.", "success");
    } else {
      placeSelectionCursor(tokenIndex);
      setFeedback("#selectionFeedback", "Clic simple : le curseur est placé, mais aucun texte n’est sélectionné.", "info");
    }
  });
  $("#selectionLab").addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectedTokenIndexes = new Set(selectionTasks[selectionRound].words.map((_, i) => i));
      updateSelectionTokens();
      setFeedback("#selectionFeedback", "Ctrl+A détecté : tout le texte est sélectionné.", "success");
    }
  });
  $("#selectionValidate").addEventListener("click", validateSelection);

  $$("#styleAnswers button").forEach(button => button.addEventListener("click", () => answerStyle(button)));
  ["#fontSelect", "#sizeSelect", "#colorSelect"].forEach(id => $(id).addEventListener("change", applyAppearancePreview));
  $("#appearanceValidate").addEventListener("click", validateAppearance);
  $$("#alignmentToolbar button").forEach(button => button.addEventListener("click", () => answerAlignment(button)));
  $$("[data-align-example]").forEach(button => button.addEventListener("click", () => {
    const matching = $(`#alignmentToolbar [data-align='${button.dataset.alignExample}']`);
    matching.focus();
    showToast(`Exemple observé : ${colorAlignment(button.dataset.alignExample)}`);
  }));

  $$('[data-repair-part]').forEach(part => part.addEventListener("click", event => {
    event.stopPropagation();
    repairSelection = part.dataset.repairPart;
    renderRepair();
    setFeedback("#repairFeedback", `Zone sélectionnée : ${repairSelection === "title" ? "le titre" : repairSelection === "paragraph" ? "le paragraphe" : "le mot lave"}.`);
  }));
  $("#repairToolbar").addEventListener("change", event => {
    const tool = event.target.dataset.tool;
    if (tool) applyRepairTool(tool, event.target.value);
  });
  $("#repairToolbar").addEventListener("click", event => {
    const button = event.target.closest("button[data-tool]");
    if (button) applyRepairTool(button.dataset.tool);
  });
  $("#repairValidate").addEventListener("click", validateRepair);

  $$("#shortcutAnswers button").forEach(button => button.addEventListener("click", () => answerShortcut(button)));

  $$('[data-final-part]').forEach(part => part.addEventListener("click", event => {
    event.stopPropagation();
    finalSelection = part.dataset.finalPart;
    renderFinalEditor();
    setFeedback("#finalFeedback", `Zone sélectionnée : ${finalSelection === "title" ? "le titre" : finalSelection === "paragraph" ? "le paragraphe" : "le mot fragile"}.`);
  }));
  $("#finalToolbar").addEventListener("change", event => {
    const tool = event.target.dataset.finalTool;
    if (tool) applyFinalTool(tool, event.target.value);
  });
  $("#finalToolbar").addEventListener("click", event => {
    const button = event.target.closest("button[data-final-tool]");
    if (button) applyFinalTool(button.dataset.finalTool);
  });
  $("#finalValidate").addEventListener("click", validateFinalEditor);

  $("#bonusStart").addEventListener("click", startBonus);
  $("#bonusAnswers").addEventListener("click", event => {
    const button = event.target.closest("[data-bonus-answer]");
    if (button) answerBonus(button);
  });
  $("#skipBonus").addEventListener("click", () => { state.bonusCompleted = false; state.bonusScore = 0; saveState(); showScreen("final"); });
  $("#finishButton").addEventListener("click", () => showScreen("final"));

  ["reportFirstName", "reportLastName", "reportClass"].forEach(id => {
    $(`#${id}`).addEventListener("input", event => {
      if (id === "reportFirstName") state.firstName = event.target.value;
      if (id === "reportLastName") state.lastName = event.target.value;
      if (id === "reportClass") state.className = event.target.value;
      saveState();
    });
  });
  $("#printButton").addEventListener("click", () => { renderReport(); window.print(); });
  $("#restartButton").addEventListener("click", () => {
    const identity = { firstName: state.firstName, lastName: state.lastName, className: state.className };
    state = { ...defaultState(), ...identity };
    saveState();
    location.reload();
  });
  window.addEventListener("beforeprint", renderReport);

  /* Reprise de progression. */
  function populateWelcomeIdentity() {
    $("#startFirstName").value = state.firstName;
    $("#startLastName").value = state.lastName;
    $("#startClass").value = state.className;
  }

  function resumeProgress() {
    const target = state.currentScreen === "welcome" ? (state.highestStep >= 7 ? "bonus" : `challenge${Math.max(1, state.highestStep + 1)}`) : state.currentScreen;
    const number = screenNumber(target);
    if (number >= 1 && number <= 7) [initSelection, initStyles, initAppearance, initAlignment, initRepair, initShortcuts, initFinalEditor][number - 1](false);
    showScreen(target);
  }

  $("#resumeButton").addEventListener("click", resumeProgress);
  $("#newMissionButton").addEventListener("click", () => {
    const identity = { firstName: state.firstName, lastName: state.lastName, className: state.className };
    state = { ...defaultState(), ...identity };
    saveState();
    $("#resumeCard").hidden = true;
    showToast("Nouvelle mission prête");
  });

  populateWelcomeIdentity();
  if (state.startTime || state.highestStep > 0) {
    $("#resumeCard").hidden = false;
    const targetLabel = state.currentScreen === "final" ? "le bilan" : state.currentScreen === "bonus" ? "le bonus" : `le défi ${Math.max(1, screenNumber(state.currentScreen) || state.highestStep + 1)}`;
    $("#resumeText").textContent = `Progression enregistrée : reprendre ${targetLabel}.`;
  }
  updateMissionBar();
})();
