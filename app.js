const LANGUAGE_STORAGE_KEY = "meowracle-language";
const SUPPORTED_LANGUAGES = new Set(["zh", "en"]);
const I18N_DEBUG = false;

const state = {
  data: null,
  screen: "opening",
  language: readStoredLanguage(),
  i18n: {
    en: null,
  },
  introLineIndex: 0,
  currentIssueId: null,
  currentSeedIssueId: null,
  selectedSlots: [null, null],
  activeResultType: null,
  activeResultPayload: null,
  activePenaltyType: null,
  activePenaltyPayload: null,
  isJudging: false,
  isShopEntering: false,
  isPenaltyFinishing: false,
  isOpeningTransitioning: false,
  isCatMasterEntranceActive: false,
  hasStartedIntro: false,
  shopEntryTimer: null,
  catHairTimer: null,
  openingTransitionTimer: null,
  catMasterEntranceTimer: null,
  tasteTransitionTimer: null,
  pendingTasteIssueId: null,
  pendingShopStreetIssueId: null,
  assetManifest: null,
  assetMap0427: null,
  level1VisualMap0427: null,
  audioAssets: new Map(),
  audioCache: new Map(),
  cardFlow: {
    selectedCategory: "",
    selectedSubcategory: "",
  },
  navigation: {
    stack: [],
    currentView: null,
    isRestoring: false,
    isResetting: false,
  },
  collection: [],
  isCollectingSuccess: false,
};

const assetLoadState = {
  loadedKeys: new Set(),
  failedKeys: new Set(),
  loadingPromises: new Map(),
};

let englishI18nLoadPromise = null;

const introLines = [
  "（哈欠）……又是这个点，又是这种味道。",
  "说吧，今晚是什么东西让你这只两脚兽消化不良？",
];

function readStoredLanguage() {
  try {
    const savedLanguage = window.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_LANGUAGES.has(savedLanguage) ? savedLanguage : "zh";
  } catch (error) {
    return "zh";
  }
}

function getCurrentLanguage() {
  return SUPPORTED_LANGUAGES.has(state.language) ? state.language : "zh";
}

function isEnglishMode() {
  return getCurrentLanguage() === "en";
}

function getTranslationSection(section) {
  if (!isEnglishMode()) return null;
  return state.i18n.en?.[section] || null;
}

function tUi(key, fallback = "") {
  const section = getTranslationSection("ui");
  return section?.[key] || fallback;
}

function tIntro(key, fallback = "") {
  const section = getTranslationSection("intro");
  return section?.[key] || fallback;
}

function interpolateText(template, values = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

function normalizeI18nKey(value) {
  return String(value || "").trim();
}

function i18nDebug(scope, payload = {}) {
  if (!I18N_DEBUG) return;
  console.debug(`[i18n:${scope}]`, {
    language: getCurrentLanguage(),
    englishReady: Boolean(state.i18n.en),
    ...payload,
  });
}

function getIssueId(issueOrId) {
  if (typeof issueOrId === "string") return issueOrId;
  return issueOrId?.id || issueOrId?.issue_id || issueOrId?.issueId || "";
}

function findIssueIdByVisibleText(text) {
  const normalizedText = normalizeI18nKey(text);
  if (!normalizedText || !state.data) return "";

  const cardFlowItem = state.data.card_flow?.items?.find((item) => (
    normalizeI18nKey(item?.display_title) === normalizedText
  ));
  if (cardFlowItem?.issue_id) return cardFlowItem.issue_id;

  const issue = state.data.issues?.find((item) => (
    normalizeI18nKey(item?.title) === normalizedText
    || normalizeI18nKey(item?.display_title) === normalizedText
    || normalizeI18nKey(item?.taste_description) === normalizedText
    || normalizeI18nKey(item?.riddle_text) === normalizedText
  ));
  return issue?.id || "";
}

function tSectionValue(sectionName, key, fallback = "") {
  if (!isEnglishMode()) return fallback;
  const section = getTranslationSection(sectionName);
  if (!section) return fallback;
  const normalizedKey = normalizeI18nKey(key);
  const normalizedFallback = normalizeI18nKey(fallback);
  return section[normalizedKey] || section[normalizedFallback] || fallback;
}

function tCategory(categoryOrLabel) {
  const label = typeof categoryOrLabel === "object"
    ? (categoryOrLabel?.title || categoryOrLabel?.label || categoryOrLabel?.name || "")
    : categoryOrLabel;
  return tSectionValue("categories", normalizeI18nKey(label), label);
}

function tSubcategory(subcategoryOrLabel) {
  const label = typeof subcategoryOrLabel === "object"
    ? (subcategoryOrLabel?.title || subcategoryOrLabel?.label || subcategoryOrLabel?.name || "")
    : subcategoryOrLabel;
  return tSectionValue("subcategories", normalizeI18nKey(label), label);
}

function tIssueTitle(issueOrId, fallback = "") {
  const fallbackText = fallback || (
    typeof issueOrId === "object"
      ? (issueOrId?.display_title || issueOrId?.title || issueOrId?.name || "")
      : issueOrId
  );
  const issueId = getIssueId(issueOrId) || findIssueIdByVisibleText(fallbackText);
  const translated = tSectionValue("issues", issueId, fallbackText);
  i18nDebug("issue-title", { input: issueOrId, issueId, fallback: fallbackText, translated });
  return translated;
}

function tIssueRiddle(issueOrId, fallback = "") {
  const issueId = getIssueId(issueOrId) || findIssueIdByVisibleText(fallback);
  const translated = tSectionValue("riddles", issueId, fallback);
  i18nDebug("issue-riddle", { input: issueOrId, issueId, fallback, translated });
  return translated;
}

function getShopTranslation(shopOrId) {
  if (!isEnglishMode()) return null;
  const shops = getTranslationSection("shops");
  if (!shops) return null;
  const key = normalizeI18nKey(typeof shopOrId === "string" ? shopOrId : shopOrId?.id);
  const translated = shops?.[key];
  return translated && typeof translated === "object" ? translated : null;
}

function tShopName(shopOrName, fallback = "") {
  const nameOrId = typeof shopOrName === "object"
    ? (shopOrName?.id || shopOrName?.name || shopOrName?.shop_name || "")
    : shopOrName;
  if (!isEnglishMode()) return fallback || nameOrId || "";
  const shops = getTranslationSection("shops");
  if (!shops) return fallback || nameOrId || "";
  const byId = shops[normalizeI18nKey(nameOrId)];
  if (typeof byId === "object" && byId?.name) return byId.name;
  if (typeof byId === "string") return byId;
  return shops[normalizeI18nKey(fallback)] || fallback || nameOrId || "";
}

function tShopShortName(shop, fallback = "") {
  const translated = getShopTranslation(shop);
  return translated?.shortName || fallback;
}

function tShopDescription(shop, fallback = "") {
  const translated = getShopTranslation(shop);
  return translated?.description || fallback;
}

function tShopNpc(shop, fallback = "") {
  const translated = getShopTranslation(shop);
  return translated?.npc || fallback;
}

function tShopDoorType(shop, fallback = "") {
  const translated = getShopTranslation(shop);
  return translated?.doorType || fallback;
}

function getIngredientSourceName(ingredientOrName) {
  return typeof ingredientOrName === "object"
    ? (ingredientOrName?.name || ingredientOrName?.ingredient_name || "")
    : ingredientOrName;
}

function tIngredientName(ingredientOrName, fallback = "") {
  const sourceName = getIngredientSourceName(ingredientOrName);
  return tSectionValue("ingredients", sourceName, fallback || sourceName);
}

function tIngredientDescription(ingredientOrName, fallback = "") {
  return tSectionValue("ingredientDescriptions", getIngredientSourceName(ingredientOrName), fallback);
}

function tShopkeeperLine(line) {
  return tSectionValue("shopkeeper", line, line);
}

function tMessage(key, fallback = "", values = {}) {
  const translated = tSectionValue("messages", key, fallback);
  return interpolateText(translated, values);
}

function tFoodName(issueOrId, fallback = "") {
  const issueId = getIssueId(issueOrId) || findIssueIdByVisibleText(fallback);
  return tSectionValue("foods", issueId, fallback);
}

function tWisdom(issueOrId, fallback = "") {
  const issueId = getIssueId(issueOrId) || findIssueIdByVisibleText(fallback);
  return tSectionValue("wisdom", issueId, fallback);
}

function tHalfSuccessHint(issueOrId, ingredientName, fallback = "") {
  if (!isEnglishMode()) return fallback;
  const section = getTranslationSection("halfSuccessHints");
  const issueId = getIssueId(issueOrId);
  const issueHints = section?.[issueId];
  if (!issueHints) return fallback;
  const ingredientKey = normalizeI18nKey(ingredientName);
  return issueHints[ingredientKey] || fallback;
}

function tNonsenseSlip(text) {
  return tSectionValue("nonsenseSlips", text, text);
}

function getFailurePenaltyI18nKey(typeOrKey) {
  const key = normalizeI18nKey(typeOrKey);
  const aliases = {
    "mud-paw": "mudPaw",
    "cat-hair": "catHair",
    "nonsense-slip": "nonsenseSlip",
    failure_slip: "nonsenseSlip",
  };
  return aliases[key] || key;
}

function tFailurePenalty(typeOrKey, field, fallback = "") {
  if (!isEnglishMode()) return fallback;
  const section = getTranslationSection("failurePenalties");
  const penalty = section?.[getFailurePenaltyI18nKey(typeOrKey)];
  return penalty?.[field] || fallback;
}

function tResultUi(key, fallback = "", values = {}) {
  const translated = tSectionValue("resultUi", key, fallback);
  return interpolateText(translated, values);
}

function tCollection(key, fallback = "", values = {}) {
  const translated = tSectionValue("collection", key, fallback);
  return interpolateText(translated, values);
}

function installI18nDebugHook() {
  window.__MEOWRACLE_I18N_DEBUG__ = {
    getLanguage: getCurrentLanguage,
    isEnglishReady: () => Boolean(state.i18n.en),
    hasEnglishDictionary: () => Boolean(state.i18n.en),
    tSubcategory,
    tIssueTitle,
    tIngredientName,
  };
}

async function ensureEnglishI18nLoaded() {
  if (state.i18n.en) return state.i18n.en;
  if (!englishI18nLoadPromise) {
    englishI18nLoadPromise = loadEnglishI18n()
      .then((i18n) => {
        if (!i18n) {
          console.warn("[i18n] English dictionary unavailable; falling back to Chinese text.");
        }
        state.i18n.en = i18n;
        return i18n;
      })
      .catch((error) => {
        console.warn(`[i18n] English dictionary unavailable: ${error.message || error}`);
        state.i18n.en = null;
        return null;
      })
      .finally(() => {
        englishI18nLoadPromise = null;
      });
  }
  return englishI18nLoadPromise;
}

async function setLanguage(lang) {
  const nextLanguage = SUPPORTED_LANGUAGES.has(lang) ? lang : "zh";
  state.language = nextLanguage;

  try {
    window.localStorage?.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  } catch (error) {
    debugSfxWarning("language-storage", error);
  }

  updateLanguageControls();
  if (nextLanguage === "en") {
    const i18n = await ensureEnglishI18nLoaded();
    if (!i18n) {
      updateLanguageControls();
      rerenderCurrentViewForLanguage();
      return;
    }
  }
  updateLanguageControls();
  rerenderCurrentViewForLanguage();
}

function toggleLanguage() {
  setLanguage(isEnglishMode() ? "zh" : "en");
}

function getIntroLine(index) {
  if (index === 0) return tIntro("line1", introLines[0]);
  if (index === 1) return tIntro("line2", introLines[1]);
  return introLines[index] || "";
}

function updateLanguageControls() {
  const showChineseLabel = isEnglishMode();
  const label = showChineseLabel
    ? tUi("languageButtonToChinese", "中")
    : "EN";
  const ariaLabel = showChineseLabel ? "切换到中文" : "Switch to English";

  document.documentElement.lang = isEnglishMode() ? "en" : "zh-CN";

  [els.globalLanguageBtn, els.level1LanguageBtn].forEach((button) => {
    if (!button) return;
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
  });
}

function updateLocalizedStaticText() {
  if (els.level1InfoPrompt) {
    els.level1InfoPrompt.textContent = tUi("chooseMood", "Choose your mood:");
  }
  document.querySelectorAll(".nav-icon-label").forEach((label) => {
    if (label.closest("#global-home-btn")) label.textContent = tUi("home", "Home");
    if (label.closest("#global-return-btn")) label.textContent = tUi("return", "Return");
  });
  if (els.globalHomeBtn) els.globalHomeBtn.setAttribute("aria-label", tUi("home", "返回开始"));
  if (els.level1HomeBtn) els.level1HomeBtn.setAttribute("aria-label", tUi("home", "返回开始"));
  if (els.globalReturnBtn) els.globalReturnBtn.setAttribute("aria-label", tUi("return", "返回上一页"));
  if (els.level1ReturnBtn) els.level1ReturnBtn.setAttribute("aria-label", tUi("return", "返回上一页"));
  if (els.tasteReturnBtn) els.tasteReturnBtn.setAttribute("aria-label", tUi("return", "返回上一页"));
  if (els.shopStreetReturnBtn) els.shopStreetReturnBtn.setAttribute("aria-label", tUi("return", "返回心绪卡"));
  document.querySelectorAll(".taste-return-label, .shop-street-return-label").forEach((label) => {
    label.textContent = tUi("return", "返回");
  });
  if (els.tasteGetBtn) els.tasteGetBtn.textContent = tUi("get", "Get!");
  const collectionBookLabel = document.querySelector(".collection-book-label");
  if (collectionBookLabel) collectionBookLabel.textContent = tCollection("buttonLabel", "账本");
  const collectionBookEyebrow = document.querySelector(".collection-book-eyebrow");
  if (collectionBookEyebrow) collectionBookEyebrow.textContent = tCollection("eyebrow", "深夜账本");
  const collectionBookTitle = document.getElementById("collection-book-title");
  if (collectionBookTitle) collectionBookTitle.textContent = tCollection("title", "带走的夜宵智慧");
  if (els.collectionBookClose) {
    els.collectionBookClose.setAttribute("aria-label", tCollection("close", "关闭账本"));
  }
  if (els.collectionBookButton) updateCollectionButton();
  if (els.rackTitle) els.rackTitle.textContent = tUi("ingredientRackTitle", "食材架");
  if (els.rackNote) els.rackNote.textContent = tUi("ingredientRackNote", "点两味，放上柜台");
  if (els.counterTitle) els.counterTitle.textContent = tUi("counterTitle", "献祭柜台");
  if (els.counterNote) els.counterNote.textContent = tUi("counterNote", "点击槽位可取回");
  if (els.counterHint) els.counterHint.textContent = tUi("counterHint", "食材放满两格后，按柜台铃交给猫大师。");
  if (els.submitLabel) els.submitLabel.textContent = tUi("submitLabel", "按铃：选好了");
  const issueEyebrow = document.querySelector(".issue-brief-eyebrow");
  if (issueEyebrow) issueEyebrow.textContent = tUi("issueEyebrow", "猫大师听见了");
  const shopStreetKicker = document.querySelector(".shop-street-kicker");
  if (shopStreetKicker) shopStreetKicker.textContent = tUi("shopStreetKicker", "深夜三店街");
  document.querySelectorAll(".shop-building-target-label").forEach((label) => {
    label.textContent = tUi("tonightFlavorHere", "今晚的味道在这里");
  });
}

function rerenderCurrentViewForLanguage() {
  updateLocalizedStaticText();

  if (state.screen === "cat_intro") {
    els.introDialogue.textContent = getIntroLine(state.introLineIndex);
    els.introContinueBtn.textContent = state.introLineIndex === introLines.length - 1
      ? tUi("drawCards", "抽牌")
      : tUi("continue", "继续");
    return;
  }

  if (state.activeResultType) {
    renderActiveResultText();
    if (!els.collectionBookOverlay.hidden) renderCollectionBook();
    return;
  }

  if (state.activePenaltyType) {
    renderActivePenaltyText();
    return;
  }

  if (state.isJudging || state.isShopEntering) {
    return;
  }

  const renderSafely = (renderFn) => {
    const wasRestoring = state.navigation.isRestoring;
    state.navigation.isRestoring = true;
    try {
      renderFn();
    } finally {
      state.navigation.isRestoring = wasRestoring;
    }
  };

  if (state.screen === "category_selection") {
    renderSafely(renderCategorySelection);
    return;
  }

  if (state.screen === "subcategory_selection" && state.cardFlow.selectedCategory) {
    renderSafely(() => renderSubcategorySelection(state.cardFlow.selectedCategory));
    return;
  }

  if (
    state.screen === "issue_selection"
    && state.cardFlow.selectedCategory
    && state.cardFlow.selectedSubcategory
  ) {
    renderSafely(() => renderIssueSelection(state.cardFlow.selectedCategory, state.cardFlow.selectedSubcategory));
    return;
  }

  if (state.screen === "taste_description" && state.pendingTasteIssueId) {
    renderTasteDescriptionText(state.pendingTasteIssueId);
    return;
  }

  if (state.screen === "shop_street" && state.pendingShopStreetIssueId) {
    renderShopStreetText(state.pendingShopStreetIssueId);
    return;
  }

  if (state.screen === "issue_play" && state.currentIssueId) {
    renderCurrentIssuePlayTextFromState();
    renderShopDisplay();
    renderIngredients();
    updateSacrificeSlots();
  }
}

const sfxAssetIds = {
  click: "click-sfx",
  "door-bell": "door-bell-sfx",
  "sacrifice-bell": "sacrifice-bell-sfx",
  "judgement-smoke": "judgement-smoke-sfx",
  success: "success-sfx",
  "failure-slip": "failure-slip-sfx",
  "slip-tear": "failure-slip-tear-sfx",
};

const cardFlowTiming = {
  selectedMs: 140,
  transitionMs: 140,
  orbMs: 430,
};

const COLLECTION_STORAGE_KEY = "cat_fortune_v3_collection";
const collectionFlyMs = 720;
// Fixed demo timing for transformation_1.gif; GIF ended events are not reliable for <img>.
const OPENING_STREET_TRANSITION_MS = 5000;
const CAT_MASTER_REST_FRAME_MS = 800;
const CAT_MASTER_TRANSFORMATION_MS = 8000;
const CAT_MASTER_WIZARD_SETTLE_MS = 700;
const INITIAL_CRITICAL_PRELOAD_TIMEOUT_MS = 12000;
const STAGE_PRELOAD_TIMEOUT_MS = 8000;
const SHOP_STREET_FADE_OUT_MS = 320;
const SHOP_INTERIOR_FADE_IN_MS = 360;
const ISSUE_PROMPT_EMPTY_TEXT = "今晚的味道还没写完。";
const ASSET_GROUPS = {
  openingCritical: [
    "opening.coverBackground",
    "opening.pushButton",
    "opening.streetToBarTransition",
    "opening.barRestBackground",
    "opening.catTransformationGif",
    "opening.barWizardBackground",
    "ui.dialogBox",
    "ui.home",
    "ui.return",
    "ui.logo",
  ],
  level1Cards: [
    "card.career",
    "card.society",
    "card.emotion",
    "card.city",
    "card.desire",
    "ui.home",
    "ui.return",
    "ui.logo",
  ],
  tasteAndShopStreet: [
    "opening.barWizardBackground",
    "ui.dialogBox",
    "ui.return",
    "shopStreet.background",
    "shopBuilding.dessertStation",
    "shopBuilding.iceRoom",
    "shopBuilding.streetStall",
  ],
  shopInteriorCommon: [
    "ui.dialogBox",
    "ui.ring",
  ],
  shopInteriorDessert: [
    "shopInterior.dessertStation",
    "shopkeeper.dessertStation",
  ],
  shopInteriorIce: [
    "shopInterior.iceRoom",
    "shopkeeper.iceRoom",
  ],
  shopInteriorStreetStall: [
    "shopInterior.streetStall",
    "shopkeeper.streetStall",
  ],
  resultVisuals: [
    "catMaster.halfSuccess",
    "catMaster.fail",
    "catMaster.success",
    "catMaster.wizard",
    "punishment.claw",
    "punishment.feather",
    "ui.dialogBox",
  ],
  foodImages: [
    "food.beef",
    "food.butter",
    "food.coconut",
    "food.currySauce",
    "food.fishBalls",
    "food.ginger",
    "food.glutinousRiceBalls",
    "food.lemon",
    "food.mango",
    "food.milk",
    "food.pineappleBun",
    "food.pomelo",
    "food.radish",
    "food.riceNoodleRoll",
    "food.sago",
    "food.tea",
    "food.thickNoodles",
    "food.coffeeBeans",
  ],
};
const SHOP_INTERIOR_GROUP_BY_ID = {
  "dessert-station": "shopInteriorDessert",
  "ice-room": "shopInteriorIce",
  "street-stall": "shopInteriorStreetStall",
};
const BACKGROUND_PRELOAD_GROUPS = [
  "tasteAndShopStreet",
  "shopInteriorCommon",
  "shopInteriorDessert",
  "shopInteriorIce",
  "shopInteriorStreetStall",
  "resultVisuals",
  "foodImages",
];
const TASTE_TO_STREET_TRANSITION_MS = 680;
const WRONG_SHOP_HINT_TEXT = "猫大师摇头：这道味道不在这里。";
const SHOP_INGREDIENT_DISPLAY_COUNT = 6;
const shopStreetAssetKeys = {
  background: "shopStreet.background",
  "dessert-station": "shopBuilding.dessertStation",
  "ice-room": "shopBuilding.iceRoom",
  "street-stall": "shopBuilding.streetStall",
};
const shopPlayAssetKeys = {
  "dessert-station": {
    interior: "shopInterior.dessertStation",
    shopkeeper: "shopkeeper.dessertStation",
  },
  "ice-room": {
    interior: "shopInterior.iceRoom",
    shopkeeper: "shopkeeper.iceRoom",
  },
  "street-stall": {
    interior: "shopInterior.streetStall",
    shopkeeper: "shopkeeper.streetStall",
  },
};

const INGREDIENT_IMAGE_KEY_BY_NAME = {
  "牛腩": "food.beef",
  "黄油": "food.butter",
  "椰浆": "food.coconut",
  "咖喱酱": "food.currySauce",
  "鱼蛋": "food.fishBalls",
  "姜汁": "food.ginger",
  "汤圆": "food.glutinousRiceBalls",
  "柠檬片": "food.lemon",
  "芒果": "food.mango",
  "黑白淡奶": "food.milk",
  "菠萝包底": "food.pineappleBun",
  "柚子": "food.pomelo",
  "萝卜": "food.radish",
  "肠粉": "food.riceNoodleRoll",
  "西米": "food.sago",
  "浓茶": "food.tea",
  "粗面": "food.thickNoodles",
  "咖啡豆": "food.coffeeBeans",
};

const resultCatAssetKeys = {
  success: "catMaster.success",
  half_success: "catMaster.halfSuccess",
  failure_slip: "catMaster.fail",
  success_wisdom: "catMaster.wizard",
};

const penaltyAssetKeys = {
  "mud-paw": "punishment.claw",
  "cat-hair": "punishment.feather",
};

const FAILURE_PENALTY_FALLBACKS = [
  { id: "nonsense-slip", weight_percent: 50 },
  { id: "mud-paw", weight_percent: 25 },
  { id: "cat-hair", weight_percent: 25 },
];

const penaltyItemPositions = {
  "mud-paw": [
    { left: "18%", top: "28%", rotate: "-18deg", scale: "1.04" },
    { left: "78%", top: "24%", rotate: "15deg", scale: "0.95" },
    { left: "24%", top: "72%", rotate: "9deg", scale: "0.92" },
    { left: "80%", top: "72%", rotate: "-12deg", scale: "1.08" },
    { left: "54%", top: "58%", rotate: "-4deg", scale: "0.86" },
  ],
  "cat-hair": [
    { left: "16%", top: "24%", rotate: "-24deg", scale: "1" },
    { left: "43%", top: "20%", rotate: "18deg", scale: "0.88" },
    { left: "76%", top: "30%", rotate: "-8deg", scale: "1.08" },
    { left: "24%", top: "70%", rotate: "12deg", scale: "1.05" },
    { left: "70%", top: "72%", rotate: "-16deg", scale: "0.94" },
  ],
};

const SHOPKEEPER_LINES = {
  "ice-room": {
    default: "少冰？少熬夜才是真的。",
    hover: "苦的、甜的、醒的，都在这排架子上。",
    click: [
      "别盯着奶茶桶发呆，先选食材。",
      "凌晨的冰室不收眼泪，只收配方。",
      "你看起来需要热奶茶，也可能只是需要睡觉。",
    ],
  },
  "street-stall": {
    default: "别站着发呆，鱼蛋不会自己跳进碗里。",
    hover: "想转运，就别怕烟火气。",
    click: [
      "手快点，后面还有猫排队。",
      "咖喱酱很辣，但有些心事更辣。",
      "选错也没事，大不了猫大师嫌弃你一下。",
    ],
  },
  "dessert-station": {
    default: "甜的不能治百病，但能让你先坐一会儿。",
    hover: "软糯的东西，最适合接住深夜。",
    click: [
      "别急，糖水要慢慢等。",
      "如果今晚睡不着，就先吃点温柔的。",
      "有些答案，藏在椰浆和汤圆之间。",
    ],
  },
};

const els = {
  gameStage: document.getElementById("game-stage"),
  header: document.getElementById("header"),
  initialLoader: document.getElementById("initial-loader"),
  initialLoaderText: document.getElementById("initial-loader-text"),
  initialLoaderBar: document.getElementById("initial-loader-bar"),
  initialLoaderPercent: document.getElementById("initial-loader-percent"),
  stagePreloadOverlay: document.getElementById("stage-preload-overlay"),
  stagePreloadText: document.getElementById("stage-preload-text"),
  stagePreloadBar: document.getElementById("stage-preload-bar"),
  stagePreloadPercent: document.getElementById("stage-preload-percent"),
  openingScreen: document.getElementById("opening-screen"),
  gameNav: document.getElementById("game-nav"),
  globalHomeBtn: document.getElementById("global-home-btn"),
  globalHomeIcon: document.getElementById("global-home-icon"),
  globalReturnBtn: document.getElementById("global-return-btn"),
  globalReturnIcon: document.getElementById("global-return-icon"),
  globalLanguageBtn: document.getElementById("global-language-btn"),
  enterDoorBtn: document.getElementById("enter-door-btn"),
  openingStatus: document.getElementById("opening-status"),
  openingTransitionLayer: document.getElementById("opening-transition-layer"),
  openingTransitionGif: document.getElementById("opening-transition-gif"),
  catMasterEntranceLayer: document.getElementById("cat-master-entrance-layer"),
  catMasterEntranceImage: document.getElementById("cat-master-entrance-image"),
  catIntroScreen: document.getElementById("cat-intro-screen"),
  introDialogue: document.getElementById("intro-dialogue"),
  introContinueBtn: document.getElementById("intro-continue-btn"),
  startScreen: document.getElementById("start-screen"),
  seedSelectionPanel: document.getElementById("seed-selection-panel"),
  issueButtons: document.getElementById("issue-buttons"),
  expandedCardFlowBtn: document.getElementById("expanded-card-flow-btn"),
  cardFlowPanel: document.getElementById("card-flow-panel"),
  cardFlowBackBtn: document.getElementById("card-flow-back-btn"),
  cardFlowTitle: document.getElementById("card-flow-title"),
  cardFlowSubtitle: document.getElementById("card-flow-subtitle"),
  cardFlowGrid: document.getElementById("card-flow-grid"),
  cardFlowLightOrb: document.getElementById("card-flow-light-orb"),
  level1InfoBar: document.getElementById("level1-info-bar"),
  level1HomeBtn: document.getElementById("level1-home-btn"),
  level1HomeIcon: document.getElementById("level1-home-icon"),
  level1ReturnBtn: document.getElementById("level1-return-btn"),
  level1ReturnIcon: document.getElementById("level1-return-icon"),
  level1LanguageBtn: document.getElementById("level1-language-btn"),
  level1InfoPrompt: document.getElementById("level1-info-prompt"),
  level1LogoIcon: document.getElementById("level1-logo-icon"),
  tasteDescriptionScreen: document.getElementById("taste-description-screen"),
  tasteCatLine: document.getElementById("taste-cat-line"),
  tasteDescriptionTitle: document.getElementById("taste-description-title"),
  tasteDescriptionText: document.getElementById("taste-description-text"),
  tasteGetBtn: document.getElementById("taste-get-btn"),
  tasteReturnBtn: document.getElementById("taste-return-btn"),
  tasteReturnIcon: document.getElementById("taste-return-icon"),
  tasteTransitionOverlay: document.getElementById("taste-transition-overlay"),
  shopStreetScreen: document.getElementById("shop-street-screen"),
  shopStreetTitle: document.getElementById("shop-street-title"),
  shopStreetSubtitle: document.getElementById("shop-street-subtitle"),
  shopStreetBuildings: document.getElementById("shop-street-buildings"),
  shopStreetHint: document.getElementById("shop-street-hint"),
  shopStreetReturnBtn: document.getElementById("shop-street-return-btn"),
  shopStreetReturnIcon: document.getElementById("shop-street-return-icon"),
  issuePlayScreen: document.getElementById("issue-play-screen"),
  issueTitle: document.getElementById("issue-play-title"),
  issueShopAnchor: document.getElementById("issue-shop-anchor"),
  catMaster: document.getElementById("cat-master"),
  riddleBox: document.getElementById("riddle-box"),
  shopUi: document.getElementById("shop-ui"),
  shopTabs: document.getElementById("shop-tabs"),
  rackTitle: document.querySelector(".rack-title"),
  rackNote: document.querySelector(".rack-note"),
  ingredients: document.getElementById("ingredients"),
  counterTitle: document.querySelector(".counter-title"),
  counterNote: document.querySelector(".counter-note"),
  counterHint: document.querySelector(".hint-text"),
  sacrificeCounter: document.getElementById("sacrifice-counter"),
  sacrificeSlots: [
    document.getElementById("sacrifice-slot-0"),
    document.getElementById("sacrifice-slot-1"),
  ],
  submitBtn: document.getElementById("submit-btn"),
  submitLabel: document.querySelector(".submit-label"),
  submitRingIcon: document.getElementById("submit-ring-icon"),
  feedback: document.getElementById("feedback"),
  shopEntryOverlay: document.getElementById("shop-entry-overlay"),
  shopEntrySign: document.getElementById("shop-entry-sign"),
  shopEntryDoor: document.getElementById("shop-entry-door"),
  shopEntryCaption: document.getElementById("shop-entry-caption"),
  judgementOverlay: document.getElementById("judgement-overlay"),
  judgementIngredientLeft: document.getElementById("judgement-ingredient-left"),
  judgementIngredientRight: document.getElementById("judgement-ingredient-right"),
  overlay: document.getElementById("overlay"),
  resultCard: document.getElementById("result-card"),
  resultCatImage: document.getElementById("result-cat-image"),
  resultCatFallback: document.getElementById("result-cat-fallback"),
  resultEyebrow: document.getElementById("result-eyebrow"),
  foodResult: document.getElementById("food-result"),
  foodName: document.getElementById("food-name"),
  wisdomText: document.getElementById("wisdom-text"),
  collectionFeedback: document.getElementById("collection-feedback"),
  resultActionBtn: document.getElementById("result-action-btn"),
  collectionBookButton: document.getElementById("collection-book-button"),
  collectionBookCount: document.getElementById("collection-book-count"),
  collectionBookOverlay: document.getElementById("collection-book-overlay"),
  collectionBookClose: document.getElementById("collection-book-close"),
  collectionBookGrid: document.getElementById("collection-book-grid"),
  penaltyOverlay: document.getElementById("penalty-overlay"),
  penaltyCard: document.getElementById("penalty-card"),
  penaltyTitle: document.getElementById("penalty-title"),
  penaltyInstruction: document.getElementById("penalty-instruction"),
  penaltyStage: document.getElementById("penalty-stage"),
};

async function loadGameData() {
  const response = await fetch("./content/runtime-data.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`加载内容失败：${response.status}`);
  }
  return response.json();
}

async function loadAssetManifest() {
  try {
    const response = await fetch("./content/asset-manifest.json", { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    debugSfxWarning("asset-manifest", error);
    return null;
  }
}

async function loadAssetMap0427() {
  try {
    const response = await fetch("./content/asset-map-0427.json", { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    debugSfxWarning("asset-map-0427", error);
    return null;
  }
}

async function loadLevel1VisualMap0427() {
  try {
    const response = await fetch("./content/level1-visual-map-0427.json", { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    debugSfxWarning("level1-visual-map-0427", error);
    return null;
  }
}

async function loadEnglishI18n() {
  try {
    const response = await fetch("./content/i18n-en.json", { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    debugSfxWarning("i18n-en", error);
    return null;
  }
}

function getAssetPath0427(key) {
  const asset = state.assetMap0427?.assets?.[key];
  if (!asset || asset.status !== "ready" || !["image", "gif"].includes(asset.type)) return "";
  return asset.path || "";
}

function getLoadedAssetPath(assetKey) {
  return assetLoadState.loadedKeys.has(assetKey) ? getAssetPath0427(assetKey) : "";
}

function getIngredientImageKey(ingredientName) {
  return INGREDIENT_IMAGE_KEY_BY_NAME[String(ingredientName || "").trim()] || "";
}

function getIngredientImagePath(ingredientName) {
  const assetKey = getIngredientImageKey(ingredientName);
  return assetKey ? getLoadedAssetPath(assetKey) : "";
}

function toCssUrl(path) {
  return `url("${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
}

function setOptionalImage(image, path, onLoad, onError) {
  if (!image) return;
  image.onload = null;
  image.onerror = null;

  if (!path) {
    image.hidden = true;
    image.removeAttribute("src");
    if (onError) onError();
    return;
  }

  image.hidden = true;
  image.removeAttribute("src");
  image.onload = () => {
    image.hidden = false;
    if (onLoad) onLoad();
  };
  image.onerror = () => {
    image.hidden = true;
    image.removeAttribute("src");
    if (onError) onError();
  };
  image.src = path;
  if (image.complete && image.naturalWidth > 0) {
    image.onload();
  }
}

function applyResultDialogAsset() {
  const dialogBoxPath = getLoadedAssetPath("ui.dialogBox");
  els.overlay.classList.toggle("has-result-dialog-box", Boolean(dialogBoxPath));
  if (dialogBoxPath) {
    els.overlay.style.setProperty("--result-dialog-box-img", toCssUrl(dialogBoxPath));
  } else {
    els.overlay.style.removeProperty("--result-dialog-box-img");
  }
}

function setResultCatAsset(assetKey, fallbackText = "🐱") {
  const path = getLoadedAssetPath(assetKey);
  els.resultCatFallback.textContent = fallbackText;
  els.resultCatFallback.hidden = false;
  els.overlay.classList.remove("has-result-cat-image");
  setOptionalImage(
    els.resultCatImage,
    path,
    () => {
      els.overlay.classList.add("has-result-cat-image");
      els.resultCatFallback.hidden = true;
    },
    () => {
      els.overlay.classList.remove("has-result-cat-image");
      els.resultCatFallback.hidden = false;
    },
  );
}

function clampPercent(percent) {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function setProgressBar(bar, percent) {
  if (!bar) return;
  bar.style.width = `${clampPercent(percent)}%`;
}

function showInitialLoader(message = "猫猫加载中……", percent = 0) {
  document.body.classList.add("is-initial-loading");
  els.initialLoader.hidden = false;
  els.initialLoader.classList.remove("is-hidden");
  els.initialLoader.setAttribute("aria-busy", "true");
  if (els.initialLoaderText) els.initialLoaderText.textContent = message;
  updateInitialLoaderProgress(percent);
}

function hideInitialLoader() {
  document.body.classList.remove("is-initial-loading");
  els.initialLoader.classList.add("is-hidden");
  els.initialLoader.setAttribute("aria-busy", "false");
  window.setTimeout(() => {
    if (els.initialLoader.classList.contains("is-hidden")) {
      els.initialLoader.hidden = true;
    }
  }, prefersReducedMotion() ? 0 : 200);
}

function updateInitialLoaderProgress(percent) {
  const safePercent = clampPercent(percent);
  setProgressBar(els.initialLoaderBar, safePercent);
  if (els.initialLoaderPercent) els.initialLoaderPercent.textContent = `${safePercent}%`;
}

function showStagePreloadOverlay(message = "猫猫还在整理占卜道具……", percent = 0) {
  els.stagePreloadText.textContent = message;
  updateStagePreloadProgress(percent);
  els.stagePreloadOverlay.dataset.visible = "true";
  els.stagePreloadOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    if (els.stagePreloadOverlay.dataset.visible !== "true") return;
    els.stagePreloadOverlay.classList.add("is-visible");
  });
}

function hideStagePreloadOverlay() {
  els.stagePreloadOverlay.dataset.visible = "false";
  els.stagePreloadOverlay.classList.remove("is-visible");
  window.setTimeout(() => {
    if (els.stagePreloadOverlay.dataset.visible !== "true") {
      els.stagePreloadOverlay.hidden = true;
    }
  }, prefersReducedMotion() ? 0 : 180);
}

function updateStagePreloadProgress(percent) {
  const safePercent = clampPercent(percent);
  setProgressBar(els.stagePreloadBar, safePercent);
  if (els.stagePreloadPercent) els.stagePreloadPercent.textContent = `${safePercent}%`;
}

function applyOpeningAsset(key, path) {
  if (!path) return;

  const root = document.documentElement;
  if (key === "opening.coverBackground") {
    root.style.setProperty("--opening-cover-bg", toCssUrl(path));
    root.classList.add("has-opening-cover-asset");
  }

  if (key === "opening.pushButton") {
    root.style.setProperty("--opening-push-img", toCssUrl(path));
    root.classList.add("has-opening-push-asset");
  }
}

function preloadImageAsset(path, key) {
  if (!path) return Promise.resolve({ key, path: "", ok: false });

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      resolve({ key, path, ok });
    };

    image.onload = () => finish(true);
    image.onerror = () => {
      debugAssetWarning(`asset-map-0427 ${key}`, new Error(`image failed: ${path}`));
      finish(false);
    };
    image.src = path;
  });
}

function isAssetReady(assetKey) {
  return assetLoadState.loadedKeys.has(assetKey) || assetLoadState.failedKeys.has(assetKey);
}

function preloadAssetKey(assetKey) {
  if (isAssetReady(assetKey)) {
    return Promise.resolve({
      key: assetKey,
      path: getAssetPath0427(assetKey),
      ok: assetLoadState.loadedKeys.has(assetKey),
    });
  }

  if (assetLoadState.loadingPromises.has(assetKey)) {
    return assetLoadState.loadingPromises.get(assetKey);
  }

  const path = getAssetPath0427(assetKey);
  if (!path) {
    assetLoadState.failedKeys.add(assetKey);
    debugAssetWarning(`asset-map-0427 ${assetKey}`, new Error("missing or unsupported asset key"));
    return Promise.resolve({ key: assetKey, path: "", ok: false });
  }

  const promise = preloadImageAsset(path, assetKey)
    .then((result) => {
      if (result.ok) {
        assetLoadState.loadedKeys.add(assetKey);
        assetLoadState.failedKeys.delete(assetKey);
      } else {
        assetLoadState.failedKeys.add(assetKey);
      }
      return result;
    })
    .catch((error) => {
      assetLoadState.failedKeys.add(assetKey);
      debugAssetWarning(`asset-map-0427 ${assetKey}`, error);
      return { key: assetKey, path, ok: false };
    })
    .finally(() => {
      assetLoadState.loadingPromises.delete(assetKey);
    });

  assetLoadState.loadingPromises.set(assetKey, promise);
  return promise;
}

async function preloadAssetKeys(keys, options = {}) {
  const { timeoutMs = 0, onProgress = null, onLoaded = null } = options;
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  const total = uniqueKeys.length;
  const results = new Map();
  let done = 0;
  let settled = false;
  let timeoutId = null;

  if (!total) {
    if (onProgress) onProgress(100, 0, 0, null);
    return { timedOut: false, results: [] };
  }

  return new Promise((resolve) => {
    const complete = (timedOut) => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      resolve({ timedOut, results: Array.from(results.values()) });
    };

    uniqueKeys.forEach((key) => {
      preloadAssetKey(key).then((result) => {
        if (!results.has(key)) {
          results.set(key, result);
          done += 1;
        }
        if (result.ok && onLoaded) onLoaded(key, result.path);
        if (onProgress) onProgress((done / total) * 100, done, total, result);
        if (done >= total) complete(false);
      });
    });

    if (timeoutMs > 0) {
      timeoutId = window.setTimeout(() => {
        const pendingKeys = uniqueKeys.filter((key) => !results.has(key) && !isAssetReady(key));
        pendingKeys.forEach((key) => {
          assetLoadState.failedKeys.add(key);
          debugAssetWarning(`asset-map-0427 ${key}`, new Error(`group preload timed out after ${timeoutMs}ms`));
        });
        complete(true);
      }, timeoutMs);
    }
  });
}

async function ensureAssetsReady(assetKeys, options = {}) {
  const {
    message = "猫猫还在整理占卜道具……",
    timeoutMs = STAGE_PRELOAD_TIMEOUT_MS,
    showOverlay = true,
  } = options;
  const uniqueKeys = Array.from(new Set(assetKeys.filter(Boolean)));
  const readyCount = uniqueKeys.filter(isAssetReady).length;

  if (readyCount >= uniqueKeys.length) return { timedOut: false, results: [] };

  if (showOverlay) {
    showStagePreloadOverlay(message, uniqueKeys.length ? (readyCount / uniqueKeys.length) * 100 : 100);
  }

  const result = await preloadAssetKeys(uniqueKeys, {
    timeoutMs,
    onProgress: (_percent, done, total) => {
      if (!showOverlay) return;
      updateStagePreloadProgress(total ? (done / total) * 100 : 100);
    },
  });

  if (showOverlay) {
    updateStagePreloadProgress(100);
    hideStagePreloadOverlay();
  }

  return result;
}

function getAssetGroupKeys(...groupNames) {
  return groupNames.flatMap((groupName) => ASSET_GROUPS[groupName] || []);
}

function getShopInteriorAssetGroupName(shopId) {
  return SHOP_INTERIOR_GROUP_BY_ID[shopId] || "";
}

function startBackgroundAssetPreload() {
  preloadAssetKeys(getAssetGroupKeys(...BACKGROUND_PRELOAD_GROUPS), {
    onLoaded: applyOpeningAsset,
  }).catch((error) => {
    debugAssetWarning("background-assets", error);
  });
}

function isLocalDebugHost() {
  return ["", "localhost", "127.0.0.1"].includes(window.location.hostname);
}

function debugAssetWarning(key, error) {
  console.warn(`[asset preload] ${key}: ${error.message || error}`);
}

function debugSfxWarning(key, error) {
  if (!isLocalDebugHost()) return;
  console.debug(`[audio hook] ${key} skipped: ${error.message || error}`);
}

function preloadAudioAssets() {
  state.audioAssets.clear();
  state.audioCache.clear();

  if (!state.assetManifest || !Array.isArray(state.assetManifest.assets)) return;

  state.assetManifest.assets
    .filter((asset) => asset.type === "audio")
    .forEach((asset) => {
      state.audioAssets.set(asset.id, asset);

      if (asset.status !== "ready" || !asset.path) return;
      const audio = new Audio(asset.path);
      audio.preload = "auto";
      state.audioCache.set(asset.id, audio);
    });
}

function resolveAudioAssetPath(key) {
  const assetId = sfxAssetIds[key] || key;
  const asset = state.audioAssets.get(assetId);
  if (!asset || asset.type !== "audio" || asset.status !== "ready") return "";
  return asset.path || "";
}

function playSfx(key) {
  const assetId = sfxAssetIds[key] || key;
  const path = resolveAudioAssetPath(key);
  if (!path) return;

  try {
    const cachedAudio = state.audioCache.get(assetId);
    const audio = cachedAudio ? cachedAudio.cloneNode(true) : new Audio(path);
    audio.volume = 0.65;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((error) => debugSfxWarning(key, error));
    }
  } catch (error) {
    debugSfxWarning(key, error);
  }
}

function getIssueById(issueId) {
  return state.data.issues.find((issue) => issue.id === issueId);
}

function getSeedIssueById(issueId) {
  return state.data.seed_issues.find((issue) => issue.issue_id === issueId);
}

function getShopById(shopId) {
  return state.data.shops.find((shop) => shop.id === shopId);
}

function getIngredientById(ingredientId) {
  return state.data.ingredients.find((ingredient) => ingredient.id === ingredientId);
}

function getIngredientImageKeyById(ingredientId) {
  const ingredient = getIngredientById(ingredientId);
  return ingredient ? getIngredientImageKey(ingredient.name) : "";
}

function getIngredientImageKeysForIds(ingredientIds) {
  return uniqueIngredientIds(ingredientIds).map(getIngredientImageKeyById).filter(Boolean);
}

function getHintById(hintId) {
  return state.data.half_success_hints.find((hint) => hint.id === hintId);
}

function getWisdomById(wisdomId) {
  return state.data.success_wisdom.find((wisdom) => wisdom.id === wisdomId);
}

function normalizeCollectionEntry(entry) {
  if (!entry || !entry.issue_id || !entry.food_name || !entry.wisdom_text) return null;
  return {
    issue_id: String(entry.issue_id),
    display_title: String(entry.display_title || ""),
    food_name: String(entry.food_name),
    wisdom_text: String(entry.wisdom_text),
    shop_id: String(entry.shop_id || ""),
    collected_at: String(entry.collected_at || new Date().toISOString()),
  };
}

function loadCollection() {
  try {
    const raw = window.localStorage?.getItem(COLLECTION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCollectionEntry).filter(Boolean);
  } catch (error) {
    debugSfxWarning("collection-load", error);
    return [];
  }
}

function saveCollection(collection) {
  try {
    window.localStorage?.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(collection));
    return true;
  } catch (error) {
    debugSfxWarning("collection-save", error);
    return false;
  }
}

function getCollectionEntries() {
  return Array.isArray(state.collection) ? state.collection : [];
}

function isCollected(issueId) {
  return getCollectionEntries().some((entry) => entry.issue_id === issueId);
}

function addToCollection(entry) {
  const normalizedEntry = normalizeCollectionEntry(entry);
  if (!normalizedEntry) {
    return { added: false, duplicate: false, saved: false, entry: null };
  }

  const collection = [...getCollectionEntries()];
  const existingIndex = collection.findIndex((item) => item.issue_id === normalizedEntry.issue_id);
  const duplicate = existingIndex !== -1;

  if (duplicate) {
    collection[existingIndex] = {
      ...collection[existingIndex],
      ...normalizedEntry,
      collected_at: normalizedEntry.collected_at,
    };
  } else {
    collection.unshift(normalizedEntry);
  }

  state.collection = collection;
  const saved = saveCollection(collection);
  return { added: true, duplicate, saved, entry: normalizedEntry };
}

function formatCollectedDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function updateCollectionButton() {
  const count = getCollectionEntries().length;
  els.collectionBookCount.textContent = String(count);
  els.collectionBookCount.setAttribute(
    "aria-label",
    tCollection("countAria", `已收藏 ${count} 张`, { count }),
  );
  els.collectionBookButton.classList.toggle("has-items", count > 0);
  els.collectionBookButton.setAttribute(
    "aria-label",
    tCollection("buttonAria", `打开收藏账本，已收藏 ${count} 张`, { count }),
  );
}

function pulseCollectionButton() {
  els.collectionBookButton.classList.remove("is-pulsing");
  window.requestAnimationFrame(() => {
    els.collectionBookButton.classList.add("is-pulsing");
  });
  window.setTimeout(() => {
    els.collectionBookButton.classList.remove("is-pulsing");
  }, 620);
}

function buildCurrentCollectionEntry() {
  const issue = getIssueById(state.currentIssueId);
  if (!issue) return null;
  const wisdom = getWisdomById(issue.success_wisdom_id);

  return {
    issue_id: issue.id,
    display_title: getIssueDisplayTitle(issue),
    food_name: issue.food_name || els.foodName.textContent || "深夜夜宵",
    wisdom_text: wisdom?.text || els.wisdomText.textContent || "猫大师点点头，但这份智慧还没写好。",
    shop_id: issue.shop_id || "",
    collected_at: new Date().toISOString(),
  };
}

function createCollectionCard(entry) {
  const card = document.createElement("article");
  card.className = "collection-card";

  const foodName = document.createElement("h4");
  foodName.textContent = tFoodName(entry.issue_id, entry.food_name);
  const issueTitle = document.createElement("div");
  issueTitle.className = "collection-card-issue";
  issueTitle.textContent = tIssueTitle(entry.issue_id, entry.display_title || "未命名心绪");
  const wisdom = document.createElement("p");
  wisdom.textContent = tWisdom(entry.issue_id, entry.wisdom_text);
  const date = document.createElement("div");
  date.className = "collection-card-date";
  date.textContent = formatCollectedDate(entry.collected_at);

  card.append(foodName, issueTitle, wisdom);
  if (date.textContent) card.appendChild(date);
  return card;
}

function renderCollectionBook() {
  els.collectionBookGrid.innerHTML = "";
  const entries = getCollectionEntries();

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "collection-book-empty";
    empty.textContent = tCollection("empty", "账本还空着。先把一道夜宵的智慧带走吧。");
    els.collectionBookGrid.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    els.collectionBookGrid.appendChild(createCollectionCard(entry));
  });
}

function openCollectionBook() {
  playSfx("click");
  renderCollectionBook();
  els.collectionBookOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    els.collectionBookOverlay.classList.add("is-visible");
  });
}

function closeCollectionBook() {
  playSfx("click");
  els.collectionBookOverlay.classList.remove("is-visible");
  window.setTimeout(() => {
    if (!els.collectionBookOverlay.classList.contains("is-visible")) {
      els.collectionBookOverlay.hidden = true;
    }
  }, 160);
}

function flySuccessCardToBook() {
  updateCollectionButton();

  if (prefersReducedMotion()) {
    pulseCollectionButton();
    return Promise.resolve();
  }

  const startRect = els.resultCard.getBoundingClientRect();
  const endRect = els.collectionBookButton.getBoundingClientRect();
  const startX = startRect.left + (startRect.width / 2);
  const startY = startRect.top + (startRect.height / 2);
  const endX = endRect.left + (endRect.width / 2);
  const endY = endRect.top + (endRect.height / 2);
  const flyCard = document.createElement("div");
  flyCard.className = "collection-fly-card";
  flyCard.textContent = els.foodName.textContent || "智慧";
  flyCard.style.left = `${startX}px`;
  flyCard.style.top = `${startY}px`;
  flyCard.style.setProperty("--fly-x", `${endX - startX}px`);
  flyCard.style.setProperty("--fly-y", `${endY - startY}px`);
  document.body.appendChild(flyCard);

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      flyCard.remove();
      pulseCollectionButton();
      resolve();
    };

    flyCard.addEventListener("animationend", finish, { once: true });
    window.setTimeout(finish, collectionFlyMs + 120);
  });
}

function countItems(items) {
  return items.reduce((counts, item) => {
    counts.set(item, (counts.get(item) || 0) + 1);
    return counts;
  }, new Map());
}

function recipeMatches(selection, recipe) {
  const selectedCounts = countItems(selection);
  const recipeCounts = countItems(recipe);

  for (const [ingredientId, needed] of recipeCounts) {
    if ((selectedCounts.get(ingredientId) || 0) < needed) {
      return false;
    }
  }
  return selection.length === recipe.length;
}

function countMatchedIngredients(selection, recipe) {
  const selectedCounts = countItems(selection);
  const recipeCounts = countItems(recipe);
  let total = 0;

  for (const [ingredientId, selected] of selectedCounts) {
    total += Math.min(selected, recipeCounts.get(ingredientId) || 0);
  }

  return total;
}

function cloneNavigationPayload(payload = {}) {
  return { ...payload };
}

function navigationViewsMatch(first, second) {
  if (!first || !second) return false;
  return first.viewName === second.viewName
    && JSON.stringify(first.payload || {}) === JSON.stringify(second.payload || {});
}

function getNavigationViewForScreen(screen) {
  if (screen === "opening") {
    return { viewName: "opening", payload: {} };
  }

  if (screen === "cat_intro") {
    return { viewName: "cat_intro", payload: { introLineIndex: state.introLineIndex } };
  }

  if (screen === "category_selection") {
    return { viewName: "category_selection", payload: {} };
  }

  if (screen === "subcategory_selection") {
    return {
      viewName: "subcategory_selection",
      payload: { categoryId: state.cardFlow.selectedCategory },
    };
  }

  if (screen === "issue_selection") {
    return {
      viewName: "issue_selection",
      payload: {
        categoryId: state.cardFlow.selectedCategory,
        subcategoryId: state.cardFlow.selectedSubcategory,
      },
    };
  }

  if (screen === "taste_description") {
    return { viewName: "taste_description", payload: { issueId: state.pendingTasteIssueId } };
  }

  if (screen === "shop_street") {
    return { viewName: "shop_street", payload: { issueId: state.pendingShopStreetIssueId } };
  }

  if (screen === "shop_entry" || screen === "issue_play") {
    return { viewName: screen, payload: { issueId: state.currentIssueId } };
  }

  return null;
}

function pushNavigationView(viewName, payload = {}) {
  const nextView = {
    viewName,
    payload: cloneNavigationPayload(payload),
  };

  if (state.navigation.isRestoring || state.navigation.isResetting) {
    state.navigation.currentView = nextView;
    return;
  }

  if (
    state.navigation.currentView
    && !navigationViewsMatch(state.navigation.currentView, nextView)
  ) {
    state.navigation.stack.push(state.navigation.currentView);
  }

  state.navigation.currentView = nextView;
}

function trackNavigationForScreen(screen) {
  const view = getNavigationViewForScreen(screen);
  if (!view) return;
  pushNavigationView(view.viewName, view.payload);
}

function updateGameNavigation(screen) {
  const isCardFlowScreen = ["category_selection", "subcategory_selection", "issue_selection"].includes(screen);
  const showNav = screen !== "opening" && screen !== "shop_entry" && !isCardFlowScreen;
  const showReturn = showNav && screen !== "result";

  els.gameNav.hidden = !showNav;
  els.globalHomeBtn.hidden = !showNav;
  els.globalReturnBtn.hidden = !showReturn;
  els.globalLanguageBtn.hidden = !showNav;
}

function syncCollectionBookPlacement(isCardFlowScreen) {
  if (!els.collectionBookButton || !els.level1InfoBar || !els.header) return;

  if (isCardFlowScreen) {
    if (els.collectionBookButton.parentElement !== els.level1InfoBar) {
      els.level1InfoBar.appendChild(els.collectionBookButton);
    }
    return;
  }

  if (els.collectionBookButton.parentElement !== els.header) {
    els.header.appendChild(els.collectionBookButton);
  }
}

function setScreen(screen) {
  const selectionScreens = ["seed_selection", "category_selection", "subcategory_selection", "issue_selection"];
  const isCardFlowScreen = ["category_selection", "subcategory_selection", "issue_selection"].includes(screen);
  const isLevel1CardScreen = screen === "category_selection";
  const isLevel2CardScreen = screen === "subcategory_selection";
  const isLevel3CardScreen = screen === "issue_selection";

  trackNavigationForScreen(screen);
  state.screen = screen;
  els.openingScreen.hidden = screen !== "opening";
  els.catIntroScreen.hidden = screen !== "cat_intro";
  els.tasteDescriptionScreen.hidden = screen !== "taste_description";
  els.shopStreetScreen.hidden = screen !== "shop_street";
  els.startScreen.style.display = selectionScreens.includes(screen) ? "flex" : "none";
  els.seedSelectionPanel.hidden = screen !== "seed_selection";
  els.cardFlowPanel.hidden = !isCardFlowScreen;
  els.cardFlowPanel.classList.toggle("is-oracle-mode", isCardFlowScreen);
  els.cardFlowPanel.classList.toggle("is-level1-card-stage", isLevel1CardScreen);
  els.cardFlowPanel.classList.toggle("is-v4-oracle-bg", isLevel2CardScreen || isLevel3CardScreen);
  els.cardFlowPanel.classList.toggle("is-level2-card-stage", isLevel2CardScreen);
  els.cardFlowPanel.classList.toggle("is-level3-card-stage", isLevel3CardScreen);
  els.gameStage.classList.toggle("is-card-flow-screen", isCardFlowScreen);
  els.level1InfoBar.hidden = !isCardFlowScreen;
  els.overlay.style.display = screen === "result" ? "flex" : "none";
  syncCollectionBookPlacement(isCardFlowScreen);
  updateGameNavigation(screen);
  updateLocalizedStaticText();
}

function getShopEntryVariant(shopId) {
  const variants = {
    "ice-room": {
      className: "ice-room",
      caption: "冷气一开，夜晚暂时安静下来。",
    },
    "street-stall": {
      className: "street-stall",
      caption: "油烟和霓虹一起翻涌，猫大师朝你挥了挥爪。",
    },
    "dessert-station": {
      className: "dessert-station",
      caption: "甜味从玻璃门后慢慢漫出来。",
    },
  };

  return variants[shopId] || {
    className: "unknown-shop",
    caption: "猫大师把小店的灯慢慢点亮。",
  };
}

function showShopEntryTransition(shop) {
  const variant = getShopEntryVariant(shop?.id || "");
  els.shopEntrySign.textContent = shop?.name || "深夜小店";
  els.shopEntryCaption.textContent = variant.caption;
  els.shopEntryOverlay.className = `shop-entry-overlay ${variant.className}`;
  els.shopEntryOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    els.shopEntryOverlay.classList.add("is-visible");
  });
}

function hideShopEntryTransition(immediate = false) {
  els.shopEntryOverlay.classList.remove("is-visible");
  if (immediate) {
    els.shopEntryOverlay.hidden = true;
    return;
  }

  window.setTimeout(() => {
    if (!els.shopEntryOverlay.classList.contains("is-visible")) {
      els.shopEntryOverlay.hidden = true;
    }
  }, 180);
}

function clearShopStreetEntryFadeClasses() {
  els.shopStreetScreen.classList.remove("is-shop-street-fading-out");
  els.issuePlayScreen.classList.remove(
    "is-shop-interior-fading-in",
    "is-shop-interior-fade-visible",
  );
}

function waitShopEntryStep(durationMs) {
  const duration = Math.max(0, durationMs);
  if (state.shopEntryTimer) {
    window.clearTimeout(state.shopEntryTimer);
    state.shopEntryTimer = null;
  }
  if (duration === 0) return Promise.resolve();

  return new Promise((resolve) => {
    state.shopEntryTimer = window.setTimeout(() => {
      state.shopEntryTimer = null;
      resolve();
    }, duration);
  });
}

function preserveShopInteriorReturnPath(issueId) {
  if (state.screen !== "shop_street") return;

  state.navigation.currentView = {
    viewName: "shop_entry",
    payload: { issueId },
  };
}

async function transitionFromShopStreetToInterior(issueId, enterInterior) {
  clearShopStreetEntryFadeClasses();

  if (prefersReducedMotion() || state.screen !== "shop_street") {
    preserveShopInteriorReturnPath(issueId);
    enterInterior();
    return;
  }

  els.shopStreetScreen.classList.add("is-shop-street-fading-out");
  await waitShopEntryStep(SHOP_STREET_FADE_OUT_MS);

  els.issuePlayScreen.classList.add("is-shop-interior-fading-in");
  preserveShopInteriorReturnPath(issueId);
  enterInterior();

  window.requestAnimationFrame(() => {
    els.issuePlayScreen.classList.add("is-shop-interior-fade-visible");
  });

  await waitShopEntryStep(SHOP_INTERIOR_FADE_IN_MS);
  clearShopStreetEntryFadeClasses();
}

function getFailurePenaltyOptions() {
  const runtimePenalties = Array.isArray(state.data?.failure_penalties)
    ? state.data.failure_penalties
    : [];
  const allowedIds = new Set(FAILURE_PENALTY_FALLBACKS.map((penalty) => penalty.id));
  const options = runtimePenalties
    .filter((penalty) => allowedIds.has(penalty.id))
    .map((penalty) => ({
      id: penalty.id,
      weight_percent: Number(penalty.weight_percent) || 0,
    }))
    .filter((penalty) => penalty.weight_percent > 0);

  return options.length ? options : FAILURE_PENALTY_FALLBACKS;
}

function selectFailurePenalty() {
  const options = getFailurePenaltyOptions();
  const totalWeight = options.reduce((sum, penalty) => sum + penalty.weight_percent, 0);
  let roll = Math.random() * totalWeight;

  for (const penalty of options) {
    roll -= penalty.weight_percent;
    if (roll <= 0) return penalty.id;
  }

  return options[0]?.id || "nonsense-slip";
}

function hidePenaltyOverlay() {
  els.penaltyOverlay.classList.remove("is-visible", "mud-paw", "cat-hair");
  els.penaltyOverlay.hidden = true;
  els.penaltyStage.innerHTML = "";
}

function clearCatHairTimer() {
  if (!state.catHairTimer) return;
  window.clearTimeout(state.catHairTimer);
  state.catHairTimer = null;
}

function finishFailurePenalty() {
  if (state.isPenaltyFinishing) return;
  state.isPenaltyFinishing = true;
  clearCatHairTimer();
  hidePenaltyOverlay();
  state.activePenaltyType = null;
  state.activePenaltyPayload = null;
  state.screen = "issue_play";
  resetSelection(tResultUi("trayCleared", "已清空托盘，可以重新选择两味食材。"));
}

function showPenaltyOverlay(type, title, instruction) {
  state.activePenaltyType = type;
  state.activePenaltyPayload = { type, title, instruction };
  state.isPenaltyFinishing = false;
  state.screen = "failure_penalty";
  renderActivePenaltyText();
  els.penaltyStage.innerHTML = "";
  els.penaltyOverlay.className = `penalty-overlay ${type}`;
  els.penaltyCard.className = `penalty-card ${type}`;
  els.penaltyOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    els.penaltyOverlay.classList.add("is-visible");
  });
}

function renderActivePenaltyText() {
  const payload = state.activePenaltyPayload || {};
  const type = payload.type || state.activePenaltyType;
  if (!type) return;
  els.penaltyTitle.textContent = tFailurePenalty(type, "title", payload.title || "猫咪惩罚");
  els.penaltyInstruction.textContent = tFailurePenalty(
    type,
    "message",
    payload.instruction || "猫大师正在判断这份失败的命数。",
  );
  els.penaltyStage.querySelectorAll(".penalty-item").forEach((item) => {
    item.setAttribute(
      "aria-label",
      type === "mud-paw"
        ? tFailurePenalty(type, "clearAria", "擦掉猫爪印")
        : tFailurePenalty(type, "clearAria", "赶走猫毛"),
    );
  });
}

function handlePenaltyItemClick(item) {
  if (state.isPenaltyFinishing || item.classList.contains("is-cleared")) return;
  playSfx("click");
  item.classList.add("is-cleared");
  item.disabled = true;

  const remainingItems = els.penaltyStage.querySelectorAll(".penalty-item:not(.is-cleared)");
  if (!remainingItems.length) {
    finishFailurePenalty();
  }
}

function createPenaltyItem(type, text, position, index) {
  const item = document.createElement("button");
  item.className = `penalty-item ${type === "mud-paw" ? "mud-paw-mark" : "cat-hair-strand"}`;
  item.type = "button";
  const fallback = document.createElement("span");
  fallback.className = "penalty-item-fallback";
  fallback.textContent = text;
  item.appendChild(fallback);

  const assetPath = getLoadedAssetPath(penaltyAssetKeys[type]);
  if (assetPath) {
    const image = document.createElement("img");
    image.className = "penalty-item-image";
    image.alt = "";
    image.hidden = true;
    item.appendChild(image);
    setOptionalImage(
      image,
      assetPath,
      () => item.classList.add("has-penalty-image"),
      () => item.classList.remove("has-penalty-image"),
    );
  }

  item.style.left = position.left;
  item.style.top = position.top;
  item.style.setProperty("--penalty-rotate", position.rotate);
  item.style.setProperty("--penalty-scale", position.scale);
  item.style.setProperty("--penalty-index", index);
  item.setAttribute(
    "aria-label",
    type === "mud-paw"
      ? tFailurePenalty(type, "clearAria", "擦掉猫爪印")
      : tFailurePenalty(type, "clearAria", "赶走猫毛"),
  );
  item.addEventListener("click", () => handlePenaltyItemClick(item));
  return item;
}

function renderPenaltyItems(type, text, positions) {
  const field = document.createElement("div");
  field.className = `penalty-field ${type}`;
  positions.forEach((position, index) => {
    field.appendChild(createPenaltyItem(type, text, position, index));
  });
  els.penaltyStage.appendChild(field);
}

function filledSlotIds() {
  return state.selectedSlots.filter(Boolean);
}

function updateSacrificeSlots() {
  const filledCount = filledSlotIds().length;

  state.selectedSlots.forEach((ingredientId, index) => {
    const slot = els.sacrificeSlots[index];
    const label = slot.querySelector(".slot-label");
    const value = slot.querySelector(".slot-value");
    const ingredient = ingredientId ? getIngredientById(ingredientId) : null;
    const ingredientName = ingredient ? tIngredientName(ingredient.name) : "";

    label.textContent = isEnglishMode()
      ? interpolateText(tUi("slotLabel", "Offering Slot {index}"), { index: index + 1 })
      : `献祭槽 ${index + 1}`;
    value.textContent = ingredient ? ingredientName : tUi("slotEmpty", "等待食材");
    slot.classList.toggle("filled", Boolean(ingredientId));
    slot.classList.toggle("is-judging", state.isJudging && Boolean(ingredientId));
    slot.setAttribute("aria-label", ingredient
      ? interpolateText(tUi("removeIngredient", "移除 {ingredient}"), { ingredient: ingredientName })
      : `${label.textContent}，${value.textContent}`);
  });

  els.submitBtn.classList.toggle("ready", filledCount === 2);
  els.submitBtn.classList.toggle("is-judging", state.isJudging);
  els.submitBtn.disabled = state.isJudging;
  els.submitBtn.setAttribute("aria-disabled", filledCount === 2 && !state.isJudging ? "false" : "true");
  updateShopkeeperDialogForSelection();
}

function animateCat() {
  els.catMaster.style.transform = "scale(1.12)";
  window.setTimeout(() => {
    els.catMaster.style.transform = "scale(1)";
  }, 160);
}

function resetSelection(message = "") {
  state.selectedSlots = [null, null];
  updateSacrificeSlots();
  renderIngredients();
  els.feedback.textContent = message;
}

function getMoodCardSubtitle(seedIssue) {
  if (seedIssue.subtitle) return seedIssue.subtitle;
  if (seedIssue.mood_subtitle) return seedIssue.mood_subtitle;
  if (seedIssue.ui_subtitle) return seedIssue.ui_subtitle;

  const title = seedIssue.title || "";
  if (title.includes("Deadline")) return "雨夜赶工，心跳比霓虹还急。";
  if (title.includes("嫉妒")) return "别人的光太亮，自己的胃有点酸。";
  if (title.includes("短板")) return "把不够好的地方，先放到猫爪边。";
  if (title.includes("熬夜")) return "越困越清醒，像一盏不肯灭的灯。";
  if (title.includes("倒霉")) return "坏运气黏在鞋底，等一阵热气冲散。";
  return "把今晚说不出口的心结，交给猫大师闻闻。";
}

function getMoodCardSymbol(seedIssue, index) {
  const title = seedIssue.title || "";
  if (title.includes("Deadline")) return "☕";
  if (title.includes("嫉妒")) return "✦";
  if (title.includes("短板")) return "◐";
  if (title.includes("熬夜")) return "☾";
  if (title.includes("倒霉")) return "◇";
  return ["✦", "☾", "◇", "◐", "☕"][index % 5];
}

function resetMoodCardSelection() {
  els.issueButtons.querySelectorAll(".mood-card").forEach((card) => {
    card.classList.remove("is-selected");
    card.disabled = false;
    card.setAttribute("aria-pressed", "false");
  });
}

function selectMoodCard(card, issueId) {
  playSfx("click");
  els.issueButtons.querySelectorAll(".mood-card").forEach((item) => {
    item.classList.toggle("is-selected", item === card);
    item.disabled = true;
    item.setAttribute("aria-pressed", item === card ? "true" : "false");
  });

  window.setTimeout(() => startGame(issueId), 180);
}

function renderIssueButtons() {
  els.issueButtons.innerHTML = "";

  state.data.seed_issues.forEach((seedIssue, index) => {
    const button = document.createElement("button");
    button.className = "mood-card";
    button.type = "button";
    button.dataset.issueId = seedIssue.issue_id;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `选择心结：${seedIssue.title}`);

    const symbol = document.createElement("span");
    symbol.className = "mood-card-symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = getMoodCardSymbol(seedIssue, index);

    const content = document.createElement("span");
    content.className = "mood-card-content";

    const title = document.createElement("span");
    title.className = "mood-card-title";
    title.textContent = seedIssue.title;

    const subtitle = document.createElement("span");
    subtitle.className = "mood-card-subtitle";
    subtitle.textContent = getMoodCardSubtitle(seedIssue);

    content.append(title, subtitle);
    button.append(symbol, content);
    button.addEventListener("click", () => selectMoodCard(button, seedIssue.issue_id));
    els.issueButtons.appendChild(button);
  });
}

function clearCardFlowGrid() {
  els.cardFlowGrid.innerHTML = "";
  els.cardFlowGrid.classList.remove("is-level1-image-grid");
}

function applyNavigationIconAssets() {
  const homePath = getLoadedAssetPath("ui.home");
  const returnPath = getLoadedAssetPath("ui.return");

  if (homePath) {
    els.globalHomeIcon.src = homePath;
    els.level1HomeIcon.src = homePath;
  }
  els.globalHomeIcon.hidden = !homePath;
  els.level1HomeIcon.hidden = !homePath;

  if (returnPath) {
    els.globalReturnIcon.src = returnPath;
    els.level1ReturnIcon.src = returnPath;
  }
  els.globalReturnIcon.hidden = !returnPath;
  els.level1ReturnIcon.hidden = !returnPath;
}

function applyLevel1InfoBarAssets() {
  const logoPath = getLoadedAssetPath("ui.logo");
  applyNavigationIconAssets();

  if (logoPath) {
    els.level1LogoIcon.src = logoPath;
  }
  els.level1LogoIcon.hidden = !logoPath;
}

function applyCardFlowOracleBackgroundAsset() {
  const wizardBackgroundPath = getLoadedAssetPath("opening.barWizardBackground");
  if (wizardBackgroundPath) {
    document.documentElement.style.setProperty("--cat-speech-bg", toCssUrl(wizardBackgroundPath));
  }
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
}

function markCardFlowCardsForEnter() {
  if (prefersReducedMotion()) return;

  els.cardFlowGrid
    .querySelectorAll(".emotion-category-card, .emotion-subcategory-card, .emotion-issue-card, .card-flow-note")
    .forEach((card, index) => {
      card.classList.add("card-flow-card-enter");
      card.style.setProperty("--card-flow-index", index);
    });
}

function resetCardFlowLightOrb() {
  els.cardFlowLightOrb.classList.remove("is-visible");
  els.cardFlowPanel.classList.remove("is-collapsing-card");
}

function clearTasteTransitionTimer() {
  if (!state.tasteTransitionTimer) return;
  window.clearTimeout(state.tasteTransitionTimer);
  state.tasteTransitionTimer = null;
}

function getIssueFlowContext(issueId) {
  const seedIssue = getSeedIssueById(issueId);
  const issue = getIssueById(issueId);
  const shop = issue ? getShopById(seedIssue?.shop_id || issue.shop_id) : null;
  return { issue, seedIssue, shop };
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
}

function getCardFlowItemByIssueId(issueId) {
  if (!issueId) return null;
  return getPublicCardFlowItems().find((item) => item.issue_id === issueId) || null;
}

function getIssuePromptText(issue, seedIssue) {
  const issueId = issue?.id || seedIssue?.issue_id || seedIssue?.id || "";
  const cardFlowItem = getCardFlowItemByIssueId(issueId);

  const fallback = firstNonEmptyText(
    issue?.taste_description,
    issue?.riddle,
    issue?.riddle_text,
    seedIssue?.taste_description,
    seedIssue?.riddle,
    seedIssue?.riddle_text,
    seedIssue?.display_title,
    cardFlowItem?.display_title,
  ) || tMessage("issuePromptEmpty", ISSUE_PROMPT_EMPTY_TEXT);

  return tIssueRiddle(issueId, fallback);
}

function applyLongTextClass(element, text, threshold = 42) {
  element.classList.toggle("is-long-text", String(text || "").trim().length > threshold);
}

function applyTasteDescriptionAssets() {
  const root = document.documentElement;
  const wizardBackgroundPath = getLoadedAssetPath("opening.barWizardBackground");
  const dialogBoxPath = getLoadedAssetPath("ui.dialogBox");
  const returnPath = getLoadedAssetPath("ui.return");

  root.classList.toggle("has-taste-scene-bg", Boolean(wizardBackgroundPath));
  root.classList.toggle("has-taste-dialog-box", Boolean(dialogBoxPath));

  if (wizardBackgroundPath) {
    root.style.setProperty("--taste-scene-bg", toCssUrl(wizardBackgroundPath));
  }

  if (dialogBoxPath) {
    root.style.setProperty("--taste-dialog-box-img", toCssUrl(dialogBoxPath));
  }

  if (returnPath) {
    els.tasteReturnIcon.src = returnPath;
  }
  els.tasteReturnIcon.hidden = !returnPath;
  els.tasteReturnBtn.classList.toggle("has-return-icon", Boolean(returnPath));
}

function applyShopStreetAssets() {
  const root = document.documentElement;
  const returnPath = getLoadedAssetPath("ui.return");
  const streetPath = getLoadedAssetPath(shopStreetAssetKeys.background);
  const dessertPath = getLoadedAssetPath(shopStreetAssetKeys["dessert-station"]);
  const iceRoomPath = getLoadedAssetPath(shopStreetAssetKeys["ice-room"]);
  const streetStallPath = getLoadedAssetPath(shopStreetAssetKeys["street-stall"]);

  root.classList.toggle("has-shop-street-bg", Boolean(streetPath));
  root.classList.toggle("has-shop-building-dessert", Boolean(dessertPath));
  root.classList.toggle("has-shop-building-ice", Boolean(iceRoomPath));
  root.classList.toggle("has-shop-building-stall", Boolean(streetStallPath));

  if (streetPath) root.style.setProperty("--shop-street-bg", toCssUrl(streetPath));
  if (dessertPath) root.style.setProperty("--shop-building-dessert-img", toCssUrl(dessertPath));
  if (iceRoomPath) root.style.setProperty("--shop-building-ice-img", toCssUrl(iceRoomPath));
  if (streetStallPath) root.style.setProperty("--shop-building-stall-img", toCssUrl(streetStallPath));

  if (returnPath) {
    els.shopStreetReturnIcon.src = returnPath;
  }
  els.shopStreetReturnIcon.hidden = !returnPath;
  els.shopStreetReturnBtn.classList.toggle("has-return-icon", Boolean(returnPath));
}

function hasShopStreetAssetSet() {
  return Boolean(
    getLoadedAssetPath(shopStreetAssetKeys.background)
    && getLoadedAssetPath(shopStreetAssetKeys["dessert-station"])
    && getLoadedAssetPath(shopStreetAssetKeys["ice-room"])
    && getLoadedAssetPath(shopStreetAssetKeys["street-stall"]),
  );
}

function renderTasteDescriptionText(issueId) {
  const { issue, seedIssue } = getIssueFlowContext(issueId);
  if (!issue) return;
  const promptText = getIssuePromptText(issue, seedIssue);
  els.tasteCatLine.textContent = tUi("tasteCatLine", "Meow...this is a ‘味道题面’");
  els.tasteDescriptionTitle.textContent = getIssueDisplayTitle(issue);
  els.tasteDescriptionText.textContent = promptText;
  applyLongTextClass(els.tasteDescriptionText, promptText, isEnglishMode() ? 70 : 42);
}

function renderShopStreetText(issueId) {
  const { issue, seedIssue } = getIssueFlowContext(issueId);
  if (!issue) return;
  const promptText = getIssuePromptText(issue, seedIssue);
  els.shopStreetTitle.textContent = getIssueDisplayTitle(issue);
  els.shopStreetSubtitle.textContent = isEnglishMode()
    ? interpolateText(tUi("shopStreetSubtitle", "Follow \"{prompt}\" to the right midnight shop."), { prompt: promptText })
    : `沿着「${promptText}」找到对应的深夜小店。`;
  applyLongTextClass(els.shopStreetSubtitle, promptText, isEnglishMode() ? 70 : 30);
  resetShopStreetBuildings(getIssueFlowContext(issueId).shop?.id || "");
  if (els.shopStreetHint.textContent === WRONG_SHOP_HINT_TEXT) {
    els.shopStreetHint.textContent = tMessage("wrongShopHint", WRONG_SHOP_HINT_TEXT);
  }
}

async function showTasteDescriptionScene(issueId) {
  const { issue, seedIssue } = getIssueFlowContext(issueId);
  if (!issue) {
    startGame(issueId);
    return;
  }

  await ensureAssetsReady(getAssetGroupKeys("tasteAndShopStreet"), {
    message: "猫猫正在点亮三店街……",
    timeoutMs: STAGE_PRELOAD_TIMEOUT_MS,
  });
  state.pendingTasteIssueId = issueId;
  state.pendingShopStreetIssueId = null;
  applyTasteDescriptionAssets();
  renderTasteDescriptionText(issueId);
  setScreen("taste_description");
  window.requestAnimationFrame(() => {
    els.tasteGetBtn.focus({ preventScroll: true });
  });
}

function showTasteToStreetTransition(next) {
  clearTasteTransitionTimer();
  els.tasteTransitionOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    els.tasteTransitionOverlay.classList.add("is-visible");
  });

  state.tasteTransitionTimer = window.setTimeout(() => {
    state.tasteTransitionTimer = null;
    next();
    els.tasteTransitionOverlay.classList.remove("is-visible");
    window.setTimeout(() => {
      if (!els.tasteTransitionOverlay.classList.contains("is-visible")) {
        els.tasteTransitionOverlay.hidden = true;
      }
    }, prefersReducedMotion() ? 0 : 180);
  }, prefersReducedMotion() ? 500 : TASTE_TO_STREET_TRANSITION_MS);
}

function resetShopStreetBuildings(targetShopId) {
  els.shopStreetBuildings.querySelectorAll(".shop-building-btn").forEach((button) => {
    const isTarget = button.dataset.shopId === targetShopId;
    const shop = getShopById(button.dataset.shopId);
    const shopLabel = tShopName(button.dataset.shopId, shop?.name || button.querySelector(".shop-building-label")?.textContent || "店铺");
    const visibleLabel = button.querySelector(".shop-building-label");
    if (visibleLabel) visibleLabel.textContent = shopLabel;
    button.classList.toggle("is-target-shop", isTarget);
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", isTarget
      ? interpolateText(tUi("targetShopAria", "{shop}，今晚的味道在这里"), { shop: shopLabel })
      : interpolateText(tUi("shopAria", "{shop}"), { shop: shopLabel }));
  });
}

async function showShopStreetScene(issueId) {
  const { issue, seedIssue, shop } = getIssueFlowContext(issueId);
  if (!issue || !shop) {
    startGame(issueId);
    return;
  }

  await ensureAssetsReady(getAssetGroupKeys("tasteAndShopStreet"), {
    message: "猫猫正在点亮三店街……",
    timeoutMs: STAGE_PRELOAD_TIMEOUT_MS,
  });
  state.pendingTasteIssueId = null;
  state.pendingShopStreetIssueId = issueId;
  applyShopStreetAssets();
  clearShopStreetEntryFadeClasses();
  resetShopStreetBuildings(shop.id);
  renderShopStreetText(issueId);
  els.shopStreetHint.textContent = "";
  setScreen("shop_street");
  window.requestAnimationFrame(() => {
    els.shopStreetBuildings.querySelector(".is-target-shop")?.focus({ preventScroll: true });
  });
}

function handleTasteGetClick() {
  const issueId = state.pendingTasteIssueId;
  if (!issueId) return;
  playSfx("click");
  showTasteToStreetTransition(() => showShopStreetScene(issueId));
}

function handleTasteReturnClick() {
  playSfx("click");
  goBackToPreviousView();
}

function handleShopStreetClick(event) {
  const button = event.target.closest(".shop-building-btn");
  if (!button || !els.shopStreetBuildings.contains(button)) return;

  const issueId = state.pendingShopStreetIssueId;
  if (!issueId) return;
  const { shop } = getIssueFlowContext(issueId);
  if (!shop) {
    startGame(issueId);
    return;
  }

  playSfx("click");
  if (button.dataset.shopId !== shop.id) {
    els.shopStreetHint.textContent = tMessage("wrongShopHint", WRONG_SHOP_HINT_TEXT);
    button.setAttribute("aria-pressed", "false");
    return;
  }

  button.setAttribute("aria-pressed", "true");
  state.pendingShopStreetIssueId = null;
  startGame(issueId);
}

async function returnFromShopStreetToCardFlow() {
  playSfx("click");
  goBackToPreviousView();
}

function clearTransientOverlays() {
  if (state.shopEntryTimer) {
    window.clearTimeout(state.shopEntryTimer);
    state.shopEntryTimer = null;
  }

  clearTasteTransitionTimer();
  clearCatHairTimer();
  state.isShopEntering = false;
  state.isPenaltyFinishing = false;
  state.isJudging = false;
  state.isCollectingSuccess = false;
  state.activePenaltyType = null;
  state.activePenaltyPayload = null;
  state.activeResultType = null;
  state.activeResultPayload = null;

  els.overlay.style.display = "none";
  els.overlay.classList.remove("is-collecting-wisdom", "has-result-cat-image");
  els.resultActionBtn.disabled = false;
  els.collectionFeedback.textContent = "";
  els.collectionBookOverlay.classList.remove("is-visible");
  els.collectionBookOverlay.hidden = true;
  els.tasteTransitionOverlay.classList.remove("is-visible");
  els.tasteTransitionOverlay.hidden = true;
  els.shopStreetHint.textContent = "";
  clearShopStreetEntryFadeClasses();

  hideShopEntryTransition(true);
  hidePenaltyOverlay();
  hideJudgementOverlay(true);
  resetCardFlowLightOrb();
}

function resetNavigationToCurrentView() {
  state.navigation.stack = [];
  state.navigation.currentView = null;
  state.navigation.isResetting = true;
}

function finishNavigationReset() {
  state.navigation.isResetting = false;
}

function restoreCardFlowPreviousView(view) {
  if (view.viewName === "category_selection") {
    renderCategorySelection();
    return true;
  }

  if (view.viewName === "subcategory_selection" && view.payload.categoryId) {
    renderSubcategorySelection(view.payload.categoryId);
    return true;
  }

  if (
    view.viewName === "issue_selection"
    && view.payload.categoryId
    && view.payload.subcategoryId
  ) {
    renderIssueSelection(view.payload.categoryId, view.payload.subcategoryId);
    return true;
  }

  return false;
}

async function restoreNavigationView(view) {
  clearTransientOverlays();
  state.navigation.isRestoring = true;

  try {
    if (restoreCardFlowPreviousView(view)) return;

    if (view.viewName === "taste_description" && view.payload.issueId) {
      await showTasteDescriptionScene(view.payload.issueId);
      return;
    }

    if (view.viewName === "shop_street" && view.payload.issueId) {
      await showShopStreetScene(view.payload.issueId);
      return;
    }

    if (view.viewName === "opening") {
      goHomeToOpeningCover();
      return;
    }

    await returnToV4MoodCards();
  } finally {
    state.navigation.isRestoring = false;
  }
}

async function goBackToPreviousView() {
  const previousView = state.navigation.stack.pop();
  if (!previousView) {
    await returnToV4MoodCards();
    return;
  }

  await restoreNavigationView(previousView);
}

function transitionCardFlow(renderNext) {
  if (prefersReducedMotion() || els.cardFlowPanel.hidden) {
    resetCardFlowLightOrb();
    renderNext();
    markCardFlowCardsForEnter();
    return;
  }

  resetCardFlowLightOrb();
  els.cardFlowPanel.classList.add("is-transitioning");
  window.setTimeout(() => {
    renderNext();
    els.cardFlowPanel.classList.remove("is-transitioning");
    markCardFlowCardsForEnter();
  }, cardFlowTiming.transitionMs);
}

function selectCardThen(card, action) {
  playSfx("click");

  if (card) {
    card.classList.add("is-selected");
    card.setAttribute("aria-pressed", "true");
  }

  if (prefersReducedMotion()) {
    action();
    return;
  }

  window.setTimeout(action, cardFlowTiming.selectedMs);
}

function setLightOrbPosition(card) {
  const panelRect = els.cardFlowPanel.getBoundingClientRect();
  const cardRect = card?.getBoundingClientRect();
  const x = cardRect ? cardRect.left + (cardRect.width / 2) - panelRect.left : panelRect.width / 2;
  const y = cardRect ? cardRect.top + (cardRect.height / 2) - panelRect.top : panelRect.height / 2;

  els.cardFlowLightOrb.style.setProperty("--orb-x", `${x}px`);
  els.cardFlowLightOrb.style.setProperty("--orb-y", `${y}px`);
}

function selectIssueCard(card, issueId) {
  playSfx("click");

  if (card) {
    card.classList.add("is-selected", "is-collapsing");
    card.setAttribute("aria-pressed", "true");
  }

  if (prefersReducedMotion()) {
    showTasteDescriptionScene(issueId);
    return;
  }

  setLightOrbPosition(card);
  els.cardFlowPanel.classList.add("is-collapsing-card");
  els.cardFlowLightOrb.classList.add("is-visible");
  window.setTimeout(() => showTasteDescriptionScene(issueId), cardFlowTiming.orbMs);
}

function createCardFlowButton(className, titleText, subtitleText, onClick, options = {}) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.setAttribute("aria-label", titleText);
  button.setAttribute("aria-pressed", "false");

  if (options.symbol) {
    const symbol = document.createElement("span");
    symbol.className = "card-flow-card-symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = options.symbol;
    button.appendChild(symbol);
  }

  const title = document.createElement("span");
  title.className = "card-flow-card-title";
  title.textContent = titleText;
  const subtitle = document.createElement("span");
  subtitle.className = "card-flow-card-subtitle";
  subtitle.textContent = subtitleText;

  button.append(title, subtitle);
  button.addEventListener("click", () => onClick(button));
  return button;
}

function getLevel1VisualConfig(level1Name) {
  const items = state.level1VisualMap0427?.items;
  if (!Array.isArray(items)) return null;
  return items.find((item) => item?.level1 === level1Name && item.asset_key) || null;
}

function createLevel1CategoryCard(category) {
  const visualConfig = getLevel1VisualConfig(category.title);
  const imagePath = visualConfig ? getLoadedAssetPath(visualConfig.asset_key) : "";
  const displayTitle = tCategory(category.title);
  if (!imagePath) {
    return createCardFlowButton(
      "emotion-category-card",
      displayTitle,
      category.subtitle,
      (card) => selectCardThen(card, () => transitionCardFlow(() => renderSubcategorySelection(category.id))),
      { symbol: category.symbol },
    );
  }

  const button = document.createElement("button");
  button.className = "emotion-category-card emotion-category-image-card";
  button.type = "button";
  button.style.setProperty("--card-index", "0");
  button.setAttribute("aria-label", displayTitle);
  button.setAttribute("aria-pressed", "false");
  button.title = displayTitle;
  button.dataset.level1Title = category.title;
  button.dataset.level1Visual = visualConfig.prd_label || visualConfig.visual_title || "";

  const imageFrame = document.createElement("span");
  imageFrame.className = "emotion-category-card-image-frame";
  imageFrame.setAttribute("aria-hidden", "true");

  const image = document.createElement("img");
  image.className = "emotion-category-card-image";
  image.src = imagePath;
  image.alt = "";
  image.loading = "eager";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "emotion-category-card-label";
  label.textContent = displayTitle;

  imageFrame.appendChild(image);
  button.append(imageFrame, label);
  button.addEventListener("click", () => (
    selectCardThen(button, () => transitionCardFlow(() => renderSubcategorySelection(category.id)))
  ));
  return button;
}

function appendCardFlowNote(text) {
  const note = document.createElement("div");
  note.className = "card-flow-note";
  note.textContent = text;
  els.cardFlowGrid.appendChild(note);
}

function appendCardFlowEmpty(text) {
  const empty = document.createElement("div");
  empty.className = "card-flow-empty";
  const title = document.createElement("div");
  title.className = "card-flow-empty-title";
  title.textContent = text;
  empty.appendChild(title);
  els.cardFlowGrid.appendChild(empty);
}

function getPublicCardFlowItems() {
  const items = state.data?.card_flow?.items;
  if (!Array.isArray(items)) return [];

  return items.filter((item) => (
    item
    && item.is_public === true
    && item.issue_id
    && item.display_title
    && item.level1
    && item.level2
  ));
}

function countUnique(values) {
  return new Set(values.filter(Boolean)).size;
}

function getCardFlowCategorySymbol(title, index) {
  if (title.includes("职场") || title.includes("学业")) return "☕";
  if (title.includes("关系") || title.includes("亲密")) return "♡";
  if (title.includes("自我") || title.includes("情绪")) return "◐";
  if (title.includes("生活") || title.includes("节奏")) return "☾";
  if (title.includes("欲望") || title.includes("金钱")) return "◇";
  return ["✦", "☾", "◇", "◐", "☕"][index % 5];
}

function getCardFlowCategories() {
  const groups = new Map();

  getPublicCardFlowItems().forEach((item) => {
    if (!groups.has(item.level1)) {
      groups.set(item.level1, []);
    }
    groups.get(item.level1).push(item);
  });

  return Array.from(groups, ([title, items], index) => ({
    id: title,
    title,
    items,
    symbol: getCardFlowCategorySymbol(title, index),
    subtitle: isEnglishMode()
      ? interpolateText(tUi("categoryCount", "{directions} directions / {cards} mood cards"), {
        directions: countUnique(items.map((item) => item.level2)),
        cards: items.length,
      })
      : `${countUnique(items.map((item) => item.level2))} 个方向 / ${items.length} 张心绪卡`,
  }));
}

function getCardFlowCategory(categoryId) {
  return getCardFlowCategories().find((category) => category.id === categoryId) || null;
}

function getCardFlowSubcategories(categoryId) {
  const category = getCardFlowCategory(categoryId);
  if (!category) return [];

  const groups = new Map();
  category.items.forEach((item) => {
    if (!groups.has(item.level2)) {
      groups.set(item.level2, []);
    }
    groups.get(item.level2).push(item);
  });

  return Array.from(groups, ([title, items]) => ({
    id: title,
    title,
    items,
    subtitle: isEnglishMode()
      ? interpolateText(tUi("subcategoryCount", "{cards} mood cards"), { cards: items.length })
      : `${items.length} 张心绪卡`,
  }));
}

function getCardFlowSubcategory(categoryId, subcategoryId) {
  return getCardFlowSubcategories(categoryId).find((subcategory) => subcategory.id === subcategoryId) || null;
}

function getCardFlowTitleByIssueId(issueId) {
  return getCardFlowItemByIssueId(issueId)?.display_title || "";
}

function renderCategorySelection() {
  const categories = getCardFlowCategories();
  const hasLevel1ImageCards = categories.some((category) => {
    const visualConfig = getLevel1VisualConfig(category.title);
    return Boolean(visualConfig && getLoadedAssetPath(visualConfig.asset_key));
  });

  setScreen("category_selection");
  applyLevel1InfoBarAssets();
  els.cardFlowBackBtn.textContent = tUi("backToDefaultCards", "返回五张默认卡");
  els.cardFlowTitle.textContent = tUi("categoryTitle", "选择一种心绪方向");
  els.cardFlowSubtitle.textContent = categories.length
    ? tUi("categorySubtitle", "让猫大师先按大类闻一闻今晚的心事。")
    : tUi("categoryEmpty", "完整心绪卡牌正在整理中，本版本先保留五个默认心结。");
  clearCardFlowGrid();

  if (!categories.length) {
    appendCardFlowEmpty(tUi("categoryEmpty", "完整心绪卡牌正在整理中，本版本先保留五个默认心结。"));
    return;
  }

  els.cardFlowGrid.classList.toggle("is-level1-image-grid", hasLevel1ImageCards);

  categories.forEach((category, index) => {
    const card = createLevel1CategoryCard(category);
    card.style.setProperty("--card-index", index);
    card.style.setProperty("--card-delay", `${70 + (index * 72)}ms`);
    card.style.setProperty("--fly-x", `${(2 - index) * 118}%`);
    card.style.setProperty("--fly-rotate", `${(index - 2) * 5}deg`);
    els.cardFlowGrid.appendChild(card);
  });
}

function ensureLevel1CardAssetsReady() {
  return ensureAssetsReady(getAssetGroupKeys("level1Cards"), {
    message: "猫猫正在洗牌……",
    timeoutMs: STAGE_PRELOAD_TIMEOUT_MS,
  });
}

async function showCategorySelection() {
  playSfx("click");
  state.cardFlow.selectedCategory = "";
  state.cardFlow.selectedSubcategory = "";
  await ensureLevel1CardAssetsReady();
  transitionCardFlow(renderCategorySelection);
}

function renderSubcategorySelection(categoryId) {
  const category = getCardFlowCategory(categoryId);
  if (!category) {
    renderCategorySelection();
    return;
  }
  const subcategories = getCardFlowSubcategories(categoryId);

  state.cardFlow.selectedCategory = categoryId;
  state.cardFlow.selectedSubcategory = "";
  applyCardFlowOracleBackgroundAsset();
  setScreen("subcategory_selection");
  els.cardFlowBackBtn.textContent = tUi("backToCategories", "返回分类");
  els.cardFlowTitle.textContent = tCategory(category.title);
  els.cardFlowSubtitle.textContent = category.subtitle;
  clearCardFlowGrid();

  if (!subcategories.length) {
    appendCardFlowEmpty(tUi("subcategoryEmpty", "这个方向的心绪卡还在整理中。"));
    return;
  }

  subcategories.forEach((direction) => {
    const translatedTitle = tSubcategory(direction);
    i18nDebug("level2-card", {
      input: direction.title,
      translated: translatedTitle,
    });
    const card = createCardFlowButton(
      "emotion-subcategory-card",
      translatedTitle,
      direction.subtitle,
      (card) => selectCardThen(card, () => transitionCardFlow(() => renderIssueSelection(category.id, direction.id))),
    );
    els.cardFlowGrid.appendChild(card);
  });
}

function showSubcategorySelection(categoryId) {
  playSfx("click");
  transitionCardFlow(() => renderSubcategorySelection(categoryId));
}

function getIssueDisplayTitle(issue) {
  const cardFlowTitle = getCardFlowTitleByIssueId(issue.id);
  if (cardFlowTitle) return tIssueTitle(issue, cardFlowTitle);
  const seedIssue = getSeedIssueById(issue.id);
  const fallback = issue.title || seedIssue?.title || "未命名心绪（临时整理中）";
  return tIssueTitle(issue, fallback);
}

function renderIssueSelection(categoryId, subcategoryId) {
  const category = getCardFlowCategory(categoryId);
  const direction = getCardFlowSubcategory(categoryId, subcategoryId);
  if (!category || !direction) {
    renderCategorySelection();
    return;
  }

  state.cardFlow.selectedCategory = categoryId;
  state.cardFlow.selectedSubcategory = subcategoryId;
  applyCardFlowOracleBackgroundAsset();
  setScreen("issue_selection");
  els.cardFlowBackBtn.textContent = tUi("backToDirections", "返回方向");
  els.cardFlowTitle.textContent = tSubcategory(direction.title);
  els.cardFlowSubtitle.textContent = tUi("issueSelectionTitle", "选择一张具体心绪卡");
  clearCardFlowGrid();

  if (!direction.items.length) {
    appendCardFlowEmpty(tUi("subcategoryEmpty", "这个方向的心绪卡还在整理中。"));
    return;
  }

  direction.items.forEach((issue) => {
    const translatedTitle = tIssueTitle(issue, issue.display_title);
    i18nDebug("level3-card", {
      issueId: issue.issue_id,
      input: issue.display_title,
      translated: translatedTitle,
    });
    const card = createCardFlowButton(
      "emotion-issue-card",
      translatedTitle,
      tUi("issueCardSubtitle", "让猫大师闻闻这件事"),
      (card) => selectIssueCard(card, issue.issue_id),
    );
    els.cardFlowGrid.appendChild(card);
  });
}

function showIssueSelection(categoryId, subcategoryId) {
  playSfx("click");
  transitionCardFlow(() => renderIssueSelection(categoryId, subcategoryId));
}

async function handleCardFlowBack() {
  playSfx("click");
  await goBackToPreviousView();
}

function handleLevel1HomeClick() {
  playSfx("click");
  goHomeToOpeningCover();
}

function handleGlobalHomeClick() {
  playSfx("click");
  goHomeToOpeningCover();
}

async function handleNavigationReturnClick() {
  playSfx("click");
  await goBackToPreviousView();
}

function resetOpeningCoverState() {
  state.hasStartedIntro = false;
  state.introLineIndex = 0;
  state.isOpeningTransitioning = false;
  state.isCatMasterEntranceActive = false;
  hideOpeningTransitionGif();
  hideCatMasterEntranceLayer();
  els.enterDoorBtn.disabled = !state.data;
  els.openingStatus.textContent = state.data
    ? "雨还在下，门已经虚掩。"
    : "正在加载猫大师的菜单……";
}

function goHomeToOpeningCover() {
  clearTransientOverlays();
  resetOpeningCoverState();
  state.pendingTasteIssueId = null;
  state.pendingShopStreetIssueId = null;
  state.currentIssueId = null;
  state.currentSeedIssueId = null;
  state.selectedSlots = [null, null];
  state.cardFlow.selectedCategory = "";
  state.cardFlow.selectedSubcategory = "";
  resetMoodCardSelection();
  resetIssuePlayAssets();
  updateSacrificeSlots();

  resetNavigationToCurrentView();
  try {
    setScreen("opening");
  } finally {
    finishNavigationReset();
  }
}

function hideOpeningTransitionGif() {
  if (state.openingTransitionTimer) {
    window.clearTimeout(state.openingTransitionTimer);
    state.openingTransitionTimer = null;
  }
  els.openingTransitionLayer.classList.remove("is-visible");
  els.openingTransitionLayer.hidden = true;
  els.openingTransitionGif.onload = null;
  els.openingTransitionGif.onerror = null;
  els.openingTransitionGif.removeAttribute("src");
}

function waitCatMasterEntranceStep(durationMs) {
  const duration = Math.max(0, durationMs);
  if (state.catMasterEntranceTimer) {
    window.clearTimeout(state.catMasterEntranceTimer);
    state.catMasterEntranceTimer = null;
  }
  if (duration === 0) return Promise.resolve();

  return new Promise((resolve) => {
    state.catMasterEntranceTimer = window.setTimeout(() => {
      state.catMasterEntranceTimer = null;
      resolve();
    }, duration);
  });
}

function showCatMasterEntranceLayer() {
  els.catMasterEntranceLayer.hidden = false;
  window.requestAnimationFrame(() => {
    els.catMasterEntranceLayer.classList.add("is-visible");
  });
}

function hideCatMasterEntranceLayer() {
  if (state.catMasterEntranceTimer) {
    window.clearTimeout(state.catMasterEntranceTimer);
    state.catMasterEntranceTimer = null;
  }

  els.catMasterEntranceLayer.classList.remove("is-visible", "is-switching");
  els.catMasterEntranceLayer.hidden = true;
  els.catMasterEntranceImage.onload = null;
  els.catMasterEntranceImage.onerror = null;
  els.catMasterEntranceImage.removeAttribute("src");
  delete els.catMasterEntranceLayer.dataset.phase;
}

async function setCatMasterEntranceImage(assetKey, phase) {
  const path = getLoadedAssetPath(assetKey);
  if (!path || !els.catMasterEntranceLayer || !els.catMasterEntranceImage) return false;

  if (!state.isCatMasterEntranceActive) return false;

  if (!prefersReducedMotion() && els.catMasterEntranceLayer.classList.contains("is-visible")) {
    els.catMasterEntranceLayer.classList.add("is-switching");
    await waitCatMasterEntranceStep(120);
  }

  if (!state.isCatMasterEntranceActive) return false;
  els.catMasterEntranceLayer.dataset.phase = phase;
  els.catMasterEntranceImage.src = "";
  els.catMasterEntranceImage.src = path;
  showCatMasterEntranceLayer();

  window.requestAnimationFrame(() => {
    els.catMasterEntranceLayer.classList.remove("is-switching");
  });
  return true;
}

function showCatMasterRestFrame() {
  return setCatMasterEntranceImage("opening.barRestBackground", "rest");
}

function showCatMasterTransformation() {
  return setCatMasterEntranceImage("opening.catTransformationGif", "transformation");
}

function showCatMasterWizardFrame() {
  return setCatMasterEntranceImage("opening.barWizardBackground", "wizard");
}

function finishCatMasterEntranceSequence() {
  if (!state.isCatMasterEntranceActive && state.hasStartedIntro) return;
  state.isCatMasterEntranceActive = false;
  hideCatMasterEntranceLayer();
  startIntro();
}

async function startCatMasterEntranceSequence() {
  if (state.isCatMasterEntranceActive || state.hasStartedIntro) return;

  state.isCatMasterEntranceActive = true;
  els.enterDoorBtn.disabled = true;

  try {
    if (prefersReducedMotion()) {
      const didShowWizard = await showCatMasterWizardFrame();
      if (didShowWizard) await waitCatMasterEntranceStep(240);
      finishCatMasterEntranceSequence();
      return;
    }

    const didShowRest = await showCatMasterRestFrame();
    if (didShowRest) await waitCatMasterEntranceStep(CAT_MASTER_REST_FRAME_MS);

    const didShowTransformation = await showCatMasterTransformation();
    if (didShowTransformation) await waitCatMasterEntranceStep(CAT_MASTER_TRANSFORMATION_MS);

    const didShowWizard = await showCatMasterWizardFrame();
    if (didShowWizard) await waitCatMasterEntranceStep(CAT_MASTER_WIZARD_SETTLE_MS);
  } catch (error) {
    debugSfxWarning("cat-master-entrance", error);
  }

  finishCatMasterEntranceSequence();
}

async function finishOpeningStreetTransition() {
  if (!state.isOpeningTransitioning) return;
  state.isOpeningTransitioning = false;
  hideOpeningTransitionGif();
  startCatMasterEntranceSequence();
}

function showOpeningTransitionGif(path) {
  return new Promise((resolve, reject) => {
    if (!path) {
      reject(new Error("missing street transition gif"));
      return;
    }

    els.openingTransitionGif.onload = () => resolve();
    els.openingTransitionGif.onerror = () => reject(new Error(`image failed: ${path}`));
    els.openingTransitionGif.src = "";
    els.openingTransitionGif.src = path;
  });
}

function startOpeningStreetTransition() {
  if (
    state.isOpeningTransitioning
    || state.isCatMasterEntranceActive
    || state.hasStartedIntro
    || state.screen !== "opening"
    || !state.data
  ) return;

  state.isOpeningTransitioning = true;
  els.enterDoorBtn.disabled = true;
  els.openingStatus.textContent = "雨街正在换场……";

  if (prefersReducedMotion()) {
    finishOpeningStreetTransition();
    return;
  }

  const transitionPath = getLoadedAssetPath("opening.streetToBarTransition");
  if (!transitionPath) {
    finishOpeningStreetTransition();
    return;
  }

  showOpeningTransitionGif(transitionPath)
    .then(() => {
      if (!state.isOpeningTransitioning) return;
      els.openingTransitionLayer.hidden = false;
      window.requestAnimationFrame(() => {
        els.openingTransitionLayer.classList.add("is-visible");
      });
      state.openingTransitionTimer = window.setTimeout(finishOpeningStreetTransition, OPENING_STREET_TRANSITION_MS);
    })
    .catch((error) => {
      debugSfxWarning("opening.streetToBarTransition", error);
      finishOpeningStreetTransition();
    });
}

function applyCatMasterSpeechIntroAssets() {
  const root = document.documentElement;
  const wizardBackgroundPath = getLoadedAssetPath("opening.barWizardBackground");
  const dialogBoxPath = getLoadedAssetPath("ui.dialogBox");

  root.classList.toggle("has-cat-speech-bg", Boolean(wizardBackgroundPath));
  root.classList.toggle("has-cat-dialog-box", Boolean(dialogBoxPath));

  if (wizardBackgroundPath) {
    root.style.setProperty("--cat-speech-bg", toCssUrl(wizardBackgroundPath));
  }

  if (dialogBoxPath) {
    root.style.setProperty("--cat-dialog-box-img", toCssUrl(dialogBoxPath));
  }
}

function renderCatMasterSpeechIntro() {
  applyCatMasterSpeechIntroAssets();
  els.introDialogue.textContent = getIntroLine(state.introLineIndex);
  els.introContinueBtn.textContent = state.introLineIndex === introLines.length - 1
    ? tUi("drawCards", "抽牌")
    : tUi("continue", "继续");
  setScreen("cat_intro");
  window.requestAnimationFrame(() => {
    els.catIntroScreen.focus({ preventScroll: true });
  });
}

async function finishCatMasterSpeechIntro() {
  state.cardFlow.selectedCategory = "";
  state.cardFlow.selectedSubcategory = "";

  if (!getCardFlowCategories().length) {
    showSeedSelection();
    return;
  }

  await ensureLevel1CardAssetsReady();
  transitionCardFlow(renderCategorySelection);
}

function startIntro() {
  if (state.hasStartedIntro) return;
  state.hasStartedIntro = true;
  playSfx("door-bell");
  state.introLineIndex = 0;
  renderCatMasterSpeechIntro();
}

function advanceCatMasterSpeechIntro() {
  playSfx("click");
  if (state.introLineIndex < introLines.length - 1) {
    state.introLineIndex += 1;
    renderCatMasterSpeechIntro();
    return;
  }

  finishCatMasterSpeechIntro();
}

function continueIntro() {
  advanceCatMasterSpeechIntro();
}

function showSeedSelection() {
  if (state.shopEntryTimer) {
    window.clearTimeout(state.shopEntryTimer);
    state.shopEntryTimer = null;
  }
  clearTasteTransitionTimer();
  clearCatHairTimer();
  state.isShopEntering = false;
  state.isPenaltyFinishing = false;
  state.activePenaltyType = null;
  state.pendingTasteIssueId = null;
  state.pendingShopStreetIssueId = null;
  els.tasteTransitionOverlay.classList.remove("is-visible");
  els.tasteTransitionOverlay.hidden = true;
  clearShopStreetEntryFadeClasses();
  hideShopEntryTransition(true);
  hidePenaltyOverlay();
  state.currentIssueId = null;
  state.currentSeedIssueId = null;
  state.selectedSlots = [null, null];
  state.isJudging = false;
  state.cardFlow.selectedCategory = "";
  state.cardFlow.selectedSubcategory = "";
  resetCardFlowLightOrb();
  hideJudgementOverlay(true);
  els.issueTitle.textContent = "选一个你此刻的心结";
  els.issueShopAnchor.textContent = "店铺还没亮灯";
  els.riddleBox.textContent = "选一个你此刻的心结，猫大师才肯开口。";
  els.riddleBox.classList.remove("is-long-text");
  els.feedback.textContent = "";
  els.shopTabs.innerHTML = "";
  els.ingredients.innerHTML = "";
  delete els.shopUi.dataset.shopId;
  delete els.shopUi.dataset.shopAssetId;
  delete els.shopUi.dataset.shopkeeperAssetId;
  resetIssuePlayAssets();
  updateSacrificeSlots();
  resetMoodCardSelection();
  setScreen("seed_selection");
}

async function returnToV4MoodCards() {
  const canRenderV4MoodCards = getCardFlowCategories().length > 0;

  if (state.shopEntryTimer) {
    window.clearTimeout(state.shopEntryTimer);
    state.shopEntryTimer = null;
  }

  clearTasteTransitionTimer();
  clearCatHairTimer();
  state.isOpeningTransitioning = false;
  state.isCatMasterEntranceActive = false;
  state.isShopEntering = false;
  state.isPenaltyFinishing = false;
  state.activePenaltyType = null;
  state.activePenaltyPayload = null;
  state.activeResultType = null;
  state.activeResultPayload = null;
  state.isCollectingSuccess = false;
  state.pendingTasteIssueId = null;
  state.pendingShopStreetIssueId = null;
  state.currentIssueId = null;
  state.currentSeedIssueId = null;
  state.selectedSlots = [null, null];
  state.isJudging = false;
  state.cardFlow.selectedCategory = "";
  state.cardFlow.selectedSubcategory = "";

  hideOpeningTransitionGif();
  hideCatMasterEntranceLayer();
  hideShopEntryTransition(true);
  hidePenaltyOverlay();
  hideJudgementOverlay(true);
  resetCardFlowLightOrb();
  resetMoodCardSelection();

  els.overlay.style.display = "none";
  els.overlay.classList.remove("is-collecting-wisdom", "has-result-cat-image");
  els.resultActionBtn.disabled = false;
  els.collectionFeedback.textContent = "";
  els.collectionBookOverlay.classList.remove("is-visible");
  els.collectionBookOverlay.hidden = true;
  els.tasteTransitionOverlay.classList.remove("is-visible");
  els.tasteTransitionOverlay.hidden = true;
  els.shopStreetHint.textContent = "";
  clearShopStreetEntryFadeClasses();
  els.issueTitle.textContent = "选一个你此刻的心结";
  els.issueShopAnchor.textContent = "店铺还没亮灯";
  els.riddleBox.textContent = "选一个你此刻的心结，猫大师才肯开口。";
  els.riddleBox.classList.remove("is-long-text");
  els.feedback.textContent = "";
  els.shopTabs.innerHTML = "";
  els.ingredients.innerHTML = "";
  delete els.shopUi.dataset.shopId;
  delete els.shopUi.dataset.shopAssetId;
  delete els.shopUi.dataset.shopkeeperAssetId;
  resetIssuePlayAssets();
  updateSacrificeSlots();

  if (!canRenderV4MoodCards) {
    showSeedSelection();
    return;
  }

  resetNavigationToCurrentView();
  try {
    await ensureLevel1CardAssetsReady();
    renderCategorySelection();
  } finally {
    finishNavigationReset();
  }
}

function getCurrentPlayContext() {
  const issue = getIssueById(state.currentIssueId);
  const seedIssue = getSeedIssueById(state.currentSeedIssueId || state.currentIssueId);
  const shopId = seedIssue?.shop_id || issue?.shop_id || "";
  const shop = getShopById(shopId);
  const recipeIngredientIds = issue?.recipe_ingredient_ids || seedIssue?.recipe_ingredient_ids || [];
  const availableIngredientIds = getPlayableShopIngredientIds(shopId, recipeIngredientIds, issue);

  return { issue, seedIssue, shop, shopId, recipeIngredientIds, availableIngredientIds };
}

function uniqueIngredientIds(ingredientIds) {
  return Array.from(new Set(ingredientIds.filter(Boolean)));
}

function getPlayableShopIngredientIds(shopId, recipeIngredientIds, issue) {
  const canonicalIngredientIds = uniqueIngredientIds((shopId && state.data.ingredients_by_shop[shopId]) || []);
  const recipeIds = uniqueIngredientIds(recipeIngredientIds);
  const displayIds = canonicalIngredientIds.slice(0, SHOP_INGREDIENT_DISPLAY_COUNT);
  const missingRecipeIds = recipeIds.filter((ingredientId) => !displayIds.includes(ingredientId));

  missingRecipeIds.forEach((ingredientId) => {
    let replaceIndex = -1;
    for (let index = displayIds.length - 1; index >= 0; index -= 1) {
      if (!recipeIds.includes(displayIds[index])) {
        replaceIndex = index;
        break;
      }
    }

    if (replaceIndex !== -1) {
      displayIds[replaceIndex] = ingredientId;
    } else if (displayIds.length < SHOP_INGREDIENT_DISPLAY_COUNT) {
      displayIds.push(ingredientId);
    }
  });

  const fallbackIds = uniqueIngredientIds([
    ...recipeIds,
    ...((issue && Array.isArray(issue.available_ingredient_ids)) ? issue.available_ingredient_ids : []),
    ...state.data.ingredients.map((ingredient) => ingredient.id),
  ]);

  fallbackIds.forEach((ingredientId) => {
    if (displayIds.length >= SHOP_INGREDIENT_DISPLAY_COUNT) return;
    if (!displayIds.includes(ingredientId)) displayIds.push(ingredientId);
  });

  return uniqueIngredientIds(displayIds).slice(0, SHOP_INGREDIENT_DISPLAY_COUNT);
}

function getShopSceneAssetId(shopId) {
  return shopPlayAssetKeys[shopId]?.interior || "";
}

function getShopkeeperAssetId(shopId) {
  return shopPlayAssetKeys[shopId]?.shopkeeper || "";
}

function resetIssuePlayAssets() {
  els.gameStage.classList.remove("has-issue-shop-interior");
  els.gameStage.style.removeProperty("--shop-interior-bg");
  els.issuePlayScreen.classList.remove(
    "has-shop-interior-bg",
    "has-sacrifice-dialog-box",
  );
  els.issuePlayScreen.style.removeProperty("--shop-interior-bg");
  els.issuePlayScreen.style.removeProperty("--sacrifice-dialog-box-img");
  els.submitBtn.classList.remove("has-ring-icon");
  els.submitRingIcon.hidden = true;
  els.submitRingIcon.removeAttribute("src");
}

function applyIssuePlayAssets(shopId) {
  const interiorPath = getLoadedAssetPath(getShopSceneAssetId(shopId));
  const dialogBoxPath = getLoadedAssetPath("ui.dialogBox");
  const ringPath = getLoadedAssetPath("ui.ring");

  els.issuePlayScreen.classList.toggle("has-shop-interior-bg", Boolean(interiorPath));
  els.issuePlayScreen.classList.toggle("has-sacrifice-dialog-box", Boolean(dialogBoxPath));

  if (interiorPath) {
    els.gameStage.classList.add("has-issue-shop-interior");
    els.gameStage.style.setProperty("--shop-interior-bg", toCssUrl(interiorPath));
    els.issuePlayScreen.style.setProperty("--shop-interior-bg", toCssUrl(interiorPath));
  } else {
    els.gameStage.classList.remove("has-issue-shop-interior");
    els.gameStage.style.removeProperty("--shop-interior-bg");
    els.issuePlayScreen.style.removeProperty("--shop-interior-bg");
  }

  if (dialogBoxPath) {
    els.issuePlayScreen.style.setProperty("--sacrifice-dialog-box-img", toCssUrl(dialogBoxPath));
  } else {
    els.issuePlayScreen.style.removeProperty("--sacrifice-dialog-box-img");
  }

  els.submitBtn.classList.remove("has-ring-icon");
  els.submitRingIcon.hidden = true;
  els.submitRingIcon.onload = () => {
    els.submitRingIcon.hidden = false;
    els.submitBtn.classList.add("has-ring-icon");
  };
  els.submitRingIcon.onerror = () => {
    els.submitBtn.classList.remove("has-ring-icon");
    els.submitRingIcon.hidden = true;
    els.submitRingIcon.removeAttribute("src");
  };

  if (ringPath) {
    els.submitRingIcon.src = ringPath;
    if (els.submitRingIcon.complete && els.submitRingIcon.naturalWidth > 0) {
      els.submitRingIcon.onload();
    }
  } else {
    els.submitRingIcon.removeAttribute("src");
  }
}

function getShopkeeperLines(shopId) {
  return SHOPKEEPER_LINES[shopId] || {
    default: "猫店员看了看你，又看了看食材架。",
    hover: "猫店员轻轻敲了敲柜台，示意你先选两味食材。",
    click: [
      "别紧张，配方会自己露出尾巴。",
      "先选食材，剩下的交给猫大师。",
      "深夜小店只收心事，不收解释。",
    ],
  };
}

function setShopkeeperLine(shopkeeper, lineEl, text) {
  shopkeeper.dataset.currentLine = text;
  updateShopkeeperDialogForSelection(shopkeeper, lineEl);
}

function createSelectedIngredientFallback(name) {
  const fallback = document.createElement("span");
  fallback.className = "selected-ingredient-fallback";
  fallback.textContent = tIngredientName(name);
  return fallback;
}

function createSelectedIngredientChip(ingredientId) {
  const ingredient = getIngredientById(ingredientId);
  const name = ingredient?.name || "神秘食材";
  const chip = document.createElement("span");
  chip.className = "selected-ingredient-chip";

  const imagePath = getIngredientImagePath(name);
  if (!imagePath) {
    chip.classList.add("has-fallback");
    chip.appendChild(createSelectedIngredientFallback(name));
    return chip;
  }

  const image = document.createElement("img");
  image.className = "selected-ingredient-icon";
  image.src = imagePath;
  image.alt = tIngredientName(name);
  image.decoding = "async";
  image.onerror = () => {
    chip.classList.add("has-fallback");
    chip.replaceChildren(createSelectedIngredientFallback(name));
  };
  chip.appendChild(image);
  return chip;
}

function updateShopkeeperDialogForSelection(
  shopkeeper = els.shopTabs.querySelector(".shopkeeper-placeholder"),
  lineEl = els.shopTabs.querySelector(".shopkeeper-line"),
) {
  if (!shopkeeper || !lineEl) return;

  const selectedIngredientIds = filledSlotIds();
  if (selectedIngredientIds.length) {
    const label = document.createElement("span");
    label.className = "selected-ingredient-label";
    label.textContent = tUi("selected", "已选：");

    const icons = document.createElement("span");
    icons.className = "selected-ingredient-icons";
    selectedIngredientIds.forEach((ingredientId) => {
      icons.appendChild(createSelectedIngredientChip(ingredientId));
    });

    shopkeeper.classList.add("has-selected-ingredients");
    lineEl.replaceChildren(label, icons);
    return;
  }

  shopkeeper.classList.remove("has-selected-ingredients");
  lineEl.textContent = tShopkeeperLine(shopkeeper.dataset.currentLine || shopkeeper.dataset.defaultLine || "");
}

function renderShopDisplay() {
  els.shopTabs.innerHTML = "";
  const { shop } = getCurrentPlayContext();
  if (!shop) return;

  const shopSceneAssetId = getShopSceneAssetId(shop.id);
  const shopkeeperAssetId = getShopkeeperAssetId(shop.id);
  els.shopUi.dataset.shopId = shop.id;
  els.shopUi.dataset.shopAssetId = shopSceneAssetId;
  els.shopUi.dataset.shopkeeperAssetId = shopkeeperAssetId;

  const card = document.createElement("div");
  card.className = "shop-card";
  card.dataset.shopId = shop.id;
  card.dataset.shopAssetId = shopSceneAssetId;
  card.dataset.shopkeeperAssetId = shopkeeperAssetId;

  const signboard = document.createElement("div");
  signboard.className = "shop-signboard";
  const signKicker = document.createElement("div");
  signKicker.className = "shop-sign-kicker";
  signKicker.textContent = tShopShortName(shop, shop.short_name || tUi("shopDefaultKicker", "深夜铺位"));
  const name = document.createElement("div");
  name.className = "shop-name";
  name.textContent = tShopName(shop.id, shop.name);
  signboard.append(signKicker, name);

  const interior = document.createElement("div");
  interior.className = "shop-interior-identity";

  const copy = document.createElement("div");
  copy.className = "shop-copy";
  const desc = document.createElement("div");
  desc.className = "shop-desc";
  desc.textContent = tShopDescription(shop, shop.description);
  const meta = document.createElement("div");
  meta.className = "shop-meta";
  meta.textContent = isEnglishMode()
    ? interpolateText(tUi("shopMeta", "Chef: {npc} / Door: {door}"), {
      npc: tShopNpc(shop, shop.npc),
      door: tShopDoorType(shop, shop.door_type),
    })
    : `店员：${shop.npc} / 门型：${shop.door_type}`;
  copy.append(desc, meta);

  const shopkeeper = document.createElement("div");
  shopkeeper.className = "shopkeeper-placeholder";
  shopkeeper.dataset.shopkeeperAssetId = shopkeeperAssetId;
  shopkeeper.dataset.clickIndex = "0";
  shopkeeper.tabIndex = 0;
  shopkeeper.setAttribute("role", "button");
  shopkeeper.setAttribute("aria-label", isEnglishMode()
    ? interpolateText(tUi("shopkeeperInteract", "Talk to {npc}"), { npc: tShopNpc(shop, shop.npc || tUi("shopkeeperGeneric", "shop cat")) })
    : `与${shop.npc || "店员猫"}互动`);
  const shopkeeperPath = getLoadedAssetPath(shopkeeperAssetId);
  const shopkeeperImage = document.createElement("img");
  shopkeeperImage.className = "shopkeeper-image";
  shopkeeperImage.alt = "";
  shopkeeperImage.hidden = true;
  shopkeeperImage.setAttribute("aria-hidden", "true");
  if (shopkeeperPath) {
    shopkeeperImage.onload = () => {
      shopkeeperImage.hidden = false;
      shopkeeper.classList.add("has-shopkeeper-image");
    };
    shopkeeperImage.onerror = () => {
      shopkeeperImage.hidden = true;
      shopkeeper.classList.remove("has-shopkeeper-image");
      shopkeeperImage.removeAttribute("src");
    };
    shopkeeperImage.src = shopkeeperPath;
    if (shopkeeperImage.complete && shopkeeperImage.naturalWidth > 0) {
      shopkeeperImage.onload();
    }
  }
  const shopkeeperCat = document.createElement("div");
  shopkeeperCat.className = "shopkeeper-cat";
  shopkeeperCat.setAttribute("aria-hidden", "true");
  shopkeeperCat.textContent = "🐱";
  const shopkeeperNote = document.createElement("div");
  shopkeeperNote.className = "shopkeeper-note";
  shopkeeperNote.textContent = tShopNpc(shop, shop.npc || tUi("shopkeeperGeneric", "店员猫"));
  const shopkeeperLine = document.createElement("div");
  shopkeeperLine.className = "shopkeeper-line";
  shopkeeperLine.setAttribute("aria-live", "polite");

  const lines = getShopkeeperLines(shop.id);
  shopkeeper.dataset.defaultLine = lines.default;
  setShopkeeperLine(shopkeeper, shopkeeperLine, lines.default);

  const showHoverLine = () => {
    if (filledSlotIds().length) return;
    shopkeeperLine.textContent = tShopkeeperLine(lines.hover);
  };
  const restoreCurrentLine = () => {
    updateShopkeeperDialogForSelection(shopkeeper, shopkeeperLine);
  };
  const speakNextLine = () => {
    const clickLines = lines.click.length ? lines.click : [lines.default];
    const currentIndex = Number(shopkeeper.dataset.clickIndex || 0);
    const nextLine = clickLines[currentIndex % clickLines.length];
    shopkeeper.dataset.clickIndex = String((currentIndex + 1) % clickLines.length);
    setShopkeeperLine(shopkeeper, shopkeeperLine, nextLine);
    shopkeeper.classList.remove("is-speaking");
    window.requestAnimationFrame(() => {
      shopkeeper.classList.add("is-speaking");
    });
    window.setTimeout(() => {
      shopkeeper.classList.remove("is-speaking");
    }, 380);
  };

  shopkeeper.addEventListener("mouseenter", showHoverLine);
  shopkeeper.addEventListener("focus", showHoverLine);
  shopkeeper.addEventListener("mouseleave", restoreCurrentLine);
  shopkeeper.addEventListener("blur", restoreCurrentLine);
  shopkeeper.addEventListener("click", speakNextLine);
  shopkeeper.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    speakNextLine();
  });

  shopkeeper.append(shopkeeperImage, shopkeeperCat, shopkeeperNote, shopkeeperLine);

  interior.append(copy, shopkeeper);
  card.append(signboard, interior);
  els.shopTabs.appendChild(card);
}

function renderIngredients() {
  els.ingredients.innerHTML = "";
  const { issue, availableIngredientIds } = getCurrentPlayContext();
  if (!issue) return;

  availableIngredientIds.forEach((ingredientId) => {
    const ingredient = getIngredientById(ingredientId);
    if (!ingredient) return;

    const selectedCount = state.selectedSlots.filter((id) => id === ingredientId).length;
    const translatedName = tIngredientName(ingredient);
    const translatedDescription = tIngredientDescription(ingredient, ingredient.description);
    i18nDebug("ingredient", {
      input: ingredient.name,
      translatedName,
      translatedDescription,
    });
    const button = document.createElement("button");
    button.className = "ingredient";
    button.type = "button";
    button.setAttribute("aria-label", translatedDescription
      ? interpolateText(tUi("chooseIngredientWithDescription", "选择{ingredient}：{description}"), {
        ingredient: translatedName,
        description: translatedDescription,
      })
      : interpolateText(tUi("chooseIngredient", "选择{ingredient}"), { ingredient: translatedName }));
    button.title = translatedDescription || translatedName;

    const defaultState = document.createElement("span");
    defaultState.className = "ingredient-default";
    const imagePath = getIngredientImagePath(ingredient.name);
    if (imagePath) {
      const visual = document.createElement("span");
      visual.className = "ingredient-visual";
      const icon = document.createElement("img");
      icon.className = "ingredient-icon";
      icon.src = imagePath;
      icon.alt = "";
      icon.loading = "eager";
      icon.decoding = "async";
      icon.onerror = () => {
        button.classList.add("has-image-error");
        visual.hidden = true;
        icon.removeAttribute("src");
      };
      visual.appendChild(icon);
      defaultState.appendChild(visual);
    } else {
      button.classList.add("has-no-image");
    }

    const name = document.createElement("span");
    name.className = "ingredient-name";
    name.textContent = translatedName;
    defaultState.appendChild(name);
    const desc = document.createElement("span");
    desc.className = "ingredient-desc";
    desc.textContent = translatedDescription;
    button.append(defaultState, desc);
    if (selectedCount) {
      const count = document.createElement("span");
      count.className = "ingredient-count";
      count.textContent = isEnglishMode()
        ? interpolateText(tUi("selectedCount", "Selected x{count}"), { count: selectedCount })
        : `已选 x${selectedCount}`;
      button.appendChild(count);
    }
    if (selectedCount) {
      button.classList.add("selected");
    }
    button.addEventListener("click", () => selectIngredient(ingredientId));
    els.ingredients.appendChild(button);
  });
}

function renderCurrentIssuePlayText(issue, seedIssue, shop) {
  if (!issue) return;
  const promptText = getIssuePromptText(issue, seedIssue);
  const shopId = shop?.id || seedIssue?.shop_id || issue.shop_id || "";
  const shopName = tShopName(shopId, shop?.name || seedIssue?.shop_name || issue.shop_name || tUi("midnightShop", "深夜小店"));
  els.issueTitle.textContent = getIssueDisplayTitle(issue);
  els.issueShopAnchor.textContent = isEnglishMode()
    ? interpolateText(tUi("shopAnchor", "Go to {shop}. Offer two ingredients."), { shop: shopName })
    : `前往 ${shopName}，选择两味食材献祭。`;
  els.riddleBox.textContent = promptText;
  applyLongTextClass(els.riddleBox, promptText, isEnglishMode() ? 70 : 34);
}

function renderCurrentIssuePlayTextFromState() {
  const { issue, seedIssue, shop } = getCurrentPlayContext();
  renderCurrentIssuePlayText(issue, seedIssue, shop);
}

function enterIssuePlay(issue, seedIssue, shop) {
  setScreen("issue_play");
  renderCurrentIssuePlayText(issue, seedIssue, shop);
  els.feedback.textContent = "";

  applyIssuePlayAssets(shop?.id || seedIssue?.shop_id || issue.shop_id || "");
  renderShopDisplay();
  renderIngredients();
  updateSacrificeSlots();
}

async function startGame(issueId) {
  if (state.isShopEntering) return;

  const { issue, seedIssue, shop } = getIssueFlowContext(issueId);
  if (!issue) return;

  state.isShopEntering = true;
  const shopId = shop?.id || seedIssue?.shop_id || issue.shop_id || "";
  const recipeIngredientIds = issue.recipe_ingredient_ids || seedIssue?.recipe_ingredient_ids || [];
  const visibleIngredientIds = getPlayableShopIngredientIds(shopId, recipeIngredientIds, issue);
  const visibleFoodImageKeys = getIngredientImageKeysForIds(visibleIngredientIds);
  await ensureAssetsReady([
    ...getAssetGroupKeys("shopInteriorCommon", getShopInteriorAssetGroupName(shopId)),
    ...visibleFoodImageKeys,
  ], {
    message: "猫猫正在摆好柜台……",
    timeoutMs: STAGE_PRELOAD_TIMEOUT_MS,
  });

  state.pendingTasteIssueId = null;
  state.pendingShopStreetIssueId = null;
  state.currentIssueId = issueId;
  state.currentSeedIssueId = seedIssue?.issue_id || null;
  state.selectedSlots = [null, null];
  state.isJudging = false;
  hideJudgementOverlay(true);

  try {
    await transitionFromShopStreetToInterior(issueId, () => {
      enterIssuePlay(issue, seedIssue, shop);
    });
  } finally {
    state.isShopEntering = false;
    state.shopEntryTimer = null;
    hideShopEntryTransition(true);
    clearShopStreetEntryFadeClasses();
  }
}

function selectIngredient(ingredientId) {
  if (!state.currentIssueId || state.isJudging) return;
  playSfx("click");
  animateCat();

  const openSlotIndex = state.selectedSlots.findIndex((slot) => !slot);
  if (openSlotIndex === -1) {
    els.feedback.textContent = tMessage("bothSlotsFull", "两个献祭槽都满了，点槽位可以取回食材。");
    return;
  }

  state.selectedSlots[openSlotIndex] = ingredientId;
  els.feedback.textContent = "";
  updateSacrificeSlots();
  renderIngredients();
}

function clearSacrificeSlot(slotIndex) {
  if (state.isJudging) return;
  if (!state.selectedSlots[slotIndex]) return;
  playSfx("click");
  state.selectedSlots[slotIndex] = null;
  els.feedback.textContent = "";
  updateSacrificeSlots();
  renderIngredients();
}

function getHalfSuccessText(issue, matchedIngredientId) {
  const hint = getHintById(issue.half_success_hint_id);
  if (!hint) return "猫大师眯起眼：有一味对了，但话还没说完整。";
  if (hint.type === "shared") return hint.shared_hint || hint.matches[0]?.text || "有一味对了。";
  return hint.matches.find((match) => match.ingredient_id === matchedIngredientId)?.text || hint.matches[0]?.text || "有一味对了。";
}

function getHalfSuccessHintIngredientName(matchedIngredientId) {
  const ingredient = getIngredientById(matchedIngredientId);
  return ingredient?.name || "";
}

function pickNonsenseSlip() {
  const slips = state.data.nonsense_slips;
  if (!slips.length) return "猫咪打了个哈欠，你什么也没得到。";
  const index = Math.floor(Math.random() * slips.length);
  return slips[index].text;
}

function showNonsenseSlipFailure() {
  showResult({
    type: "failure_slip",
    penaltyType: "nonsense-slip",
    eyebrow: "猫咪废话签",
    title: "猫咪废话签",
    body: pickNonsenseSlip(),
    icon: "📜",
    actionLabel: "撕掉",
  });
}

function showMudPawFailure() {
  showPenaltyOverlay(
    "mud-paw",
    "泥巴猫爪印",
    "猫咪嫌弃你的食物，留下爪印跑了。",
  );
  renderPenaltyItems("mud-paw", "🐾", penaltyItemPositions["mud-paw"]);
}

function showCatHairFailure() {
  showPenaltyOverlay(
    "cat-hair",
    "猫毛过敏",
    "猫咪气得炸毛，漫天猫毛让你喷嚏连连！快挥挥手赶走它们～",
  );
  renderPenaltyItems("cat-hair", "〰", penaltyItemPositions["cat-hair"]);
  clearCatHairTimer();
  state.catHairTimer = window.setTimeout(finishFailurePenalty, 7000);
}

function showFailurePunishment() {
  const penaltyId = selectFailurePenalty();
  if (penaltyId === "mud-paw") {
    showMudPawFailure();
    return;
  }

  if (penaltyId === "cat-hair") {
    showCatHairFailure();
    return;
  }

  showNonsenseSlipFailure();
}

function getIngredientDisplayName(ingredientId) {
  const ingredient = getIngredientById(ingredientId);
  return ingredient ? tIngredientName(ingredient.name) : tUi("mysteryIngredient", "神秘食材");
}

function createFusionIngredientName(name) {
  const fallback = document.createElement("span");
  fallback.className = "fusion-ingredient-name";
  fallback.textContent = name;
  return fallback;
}

function createFusionIngredientVisual(ingredientId) {
  const ingredient = getIngredientById(ingredientId);
  const rawName = ingredient?.name || "";
  const name = getIngredientDisplayName(ingredientId);
  const wrapper = document.createElement("span");
  wrapper.className = "fusion-ingredient";

  const imagePath = getIngredientImagePath(rawName);
  if (!imagePath) {
    wrapper.classList.add("has-fallback");
    wrapper.appendChild(createFusionIngredientName(name));
    return wrapper;
  }

  wrapper.classList.add("has-image");
  const image = document.createElement("img");
  image.className = "fusion-ingredient-icon judgement-ingredient-icon";
  image.src = imagePath;
  image.alt = name;
  image.decoding = "async";
  image.onerror = () => {
    wrapper.classList.remove("has-image");
    wrapper.classList.add("has-fallback");
    wrapper.replaceChildren(createFusionIngredientName(name));
  };
  wrapper.appendChild(image);
  return wrapper;
}

function setJudgementIngredientVisuals(selectedIngredientIds) {
  const [leftIngredientId, rightIngredientId] = selectedIngredientIds || [];
  els.judgementIngredientLeft.replaceChildren(createFusionIngredientVisual(leftIngredientId));
  els.judgementIngredientRight.replaceChildren(createFusionIngredientVisual(rightIngredientId));
}

function showJudgementOverlay(selectedIngredientIds) {
  setJudgementIngredientVisuals(selectedIngredientIds);
  els.sacrificeCounter.classList.add("is-judging");
  els.judgementOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    els.judgementOverlay.classList.add("is-visible");
  });
}

function hideJudgementOverlay(immediate = false) {
  els.sacrificeCounter.classList.remove("is-judging");
  els.judgementOverlay.classList.remove("is-visible");
  if (immediate) {
    els.judgementOverlay.hidden = true;
    return;
  }

  window.setTimeout(() => {
    if (!els.judgementOverlay.classList.contains("is-visible")) {
      els.judgementOverlay.hidden = true;
    }
  }, 180);
}

async function judgeSelection(issue, selectedIngredientIds) {
  await ensureAssetsReady(getAssetGroupKeys("resultVisuals"), {
    message: "猫猫正在翻结果牌……",
    timeoutMs: STAGE_PRELOAD_TIMEOUT_MS,
  });

  const recipe = issue.recipe_ingredient_ids;
  if (recipeMatches(selectedIngredientIds, recipe)) {
    const wisdom = getWisdomById(issue.success_wisdom_id);
    showResult({
      type: "success",
      issueId: issue.id,
      eyebrow: "猫大师端上一道夜宵",
      title: issue.food_name,
      body: wisdom ? wisdom.text : "猫大师点点头，但这份智慧还没写好。",
      icon: "🍜",
      actionLabel: "把智慧带走",
    });
    return;
  }

  const matchedCount = countMatchedIngredients(selectedIngredientIds, recipe);
  if (matchedCount === 1) {
    const matchedIngredientId = selectedIngredientIds.find((ingredientId) => recipe.includes(ingredientId));
    showResult({
      type: "half_success",
      issueId: issue.id,
      matchedIngredientId,
      eyebrow: "猫大师眯起眼",
      title: "差一点就对了",
      body: getHalfSuccessText(issue, matchedIngredientId),
      icon: "🍵",
      actionLabel: "我知道了",
    });
    return;
  }

  showFailurePunishment();
}

function submitSelection() {
  if (state.isJudging) return;

  const issue = getIssueById(state.currentIssueId);
  const selectedIngredientIds = filledSlotIds();
  if (!issue || selectedIngredientIds.length !== 2) {
    playSfx("click");
    els.feedback.textContent = tMessage("notEnoughIngredients", "食材还不充足哦");
    return;
  }

  playSfx("sacrifice-bell");
  state.isJudging = true;
  els.feedback.textContent = "";
  updateSacrificeSlots();
  showJudgementOverlay(selectedIngredientIds);
  window.setTimeout(() => {
    if (state.isJudging) playSfx("judgement-smoke");
  }, 360);

  window.setTimeout(() => {
    state.isJudging = false;
    hideJudgementOverlay();
    updateSacrificeSlots();
    judgeSelection(issue, selectedIngredientIds);
  }, 1000);
}

function showResult(result) {
  if (result.type === "success") {
    playSfx("success");
  } else if (result.type === "failure_slip") {
    playSfx("failure-slip");
  }

  state.activeResultType = result.type;
  state.activeResultPayload = { ...result };
  state.screen = "result";
  updateGameNavigation("result");
  els.overlay.className = `result-overlay ${result.type}`;
  els.resultCard.className = `result-card ${result.type}`;
  applyResultDialogAsset();
  setResultCatAsset(resultCatAssetKeys[result.type], result.type === "failure_slip" ? "📜" : result.icon);
  els.overlay.style.display = "flex";
  els.collectionFeedback.textContent = "";
  els.resultActionBtn.disabled = false;
  state.isCollectingSuccess = false;
  renderActiveResultText();
}

function getLocalizedResultPayload(result) {
  if (!result) return null;
  const issue = getIssueById(result.issueId || state.currentIssueId);
  const wisdom = issue ? getWisdomById(issue.success_wisdom_id) : null;

  if (result.type === "success") {
    return {
      ...result,
      eyebrow: tResultUi("successTitle", result.eyebrow),
      title: tFoodName(issue || result.issueId, result.title),
      body: tWisdom(issue || result.issueId, wisdom?.text || result.body),
      actionLabel: tResultUi("iGet", result.actionLabel),
    };
  }

  if (result.type === "half_success") {
    const ingredientName = getHalfSuccessHintIngredientName(result.matchedIngredientId);
    return {
      ...result,
      eyebrow: tResultUi("halfSuccessEyebrow", result.eyebrow),
      title: tResultUi("halfSuccessTitle", result.title),
      body: tHalfSuccessHint(issue || result.issueId, ingredientName, result.body),
      actionLabel: tResultUi("get", result.actionLabel),
    };
  }

  if (result.type === "failure_slip") {
    const penaltyType = result.penaltyType || "nonsense-slip";
    return {
      ...result,
      eyebrow: tFailurePenalty(penaltyType, "title", result.eyebrow),
      title: tFailurePenalty(penaltyType, "title", result.title),
      body: tNonsenseSlip(result.body),
      actionLabel: tResultUi("tearOff", result.actionLabel),
    };
  }

  return result;
}

function renderActiveResultText() {
  const result = getLocalizedResultPayload(state.activeResultPayload);
  if (!result) return;
  els.resultEyebrow.textContent = result.eyebrow;
  els.foodResult.textContent = result.icon;
  els.foodName.textContent = result.title;
  els.wisdomText.textContent = result.body;
  els.resultActionBtn.textContent = state.isCollectingSuccess
    ? tResultUi("collected", result.actionLabel)
    : result.actionLabel;
}

function closeRetryResult() {
  els.overlay.style.display = "none";
  els.overlay.classList.remove("is-collecting-wisdom", "has-result-cat-image");
  state.activeResultType = null;
  state.activeResultPayload = null;
  state.screen = "issue_play";
  updateGameNavigation("issue_play");
  resetSelection(tResultUi("trayCleared", "已清空托盘，可以重新选择两味食材。"));
}

function closeSuccessResult() {
  returnToV4MoodCards();
}

async function collectSuccessAndClose() {
  if (state.isCollectingSuccess) return;
  state.isCollectingSuccess = true;
  els.resultActionBtn.disabled = true;
  els.overlay.classList.add("is-collecting-wisdom");
  setResultCatAsset(resultCatAssetKeys.success_wisdom, "🐱");

  try {
    const entry = buildCurrentCollectionEntry();
    if (entry) {
      const collectionResult = addToCollection(entry);
      if (collectionResult.duplicate) {
        els.collectionFeedback.textContent = tResultUi("alreadyCollected", "老味道，新感悟");
      } else if (!collectionResult.saved) {
        els.collectionFeedback.textContent = tResultUi("collectionSessionOnly", "账本先记在本局里");
      }
      els.resultActionBtn.textContent = tResultUi("collected", "已收藏");
      await flySuccessCardToBook();
    }
  } catch (error) {
    debugSfxWarning("collection-success", error);
  }

  closeSuccessResult();
}

function handleResultAction() {
  if (state.activeResultType === "failure_slip") {
    playSfx("slip-tear");
  } else {
    playSfx("click");
  }

  if (state.activeResultType === "success") {
    collectSuccessAndClose();
    return;
  }

  closeRetryResult();
}

async function init() {
  const initialAssetKeys = Array.from(new Set(getAssetGroupKeys("openingCritical", "level1Cards")));
  const initialDataTaskTotal = 3;
  const initialLoaderTotal = initialAssetKeys.length + initialDataTaskTotal;
  let initialDataTasksDone = 0;
  const updateInitialProgress = (assetDone = 0) => {
    updateInitialLoaderProgress(((initialDataTasksDone + assetDone) / initialLoaderTotal) * 100);
  };
  const markInitialDataStep = () => {
    initialDataTasksDone += 1;
    updateInitialProgress();
  };

  showInitialLoader("猫猫正在点亮深夜占卜铺……", 0);
  try {
    installI18nDebugHook();
    setScreen("opening");
    const assetManifestPromise = loadAssetManifest();
    const i18nEnPromise = ensureEnglishI18nLoaded();
    const runtimeDataPromise = loadGameData().then((data) => {
      state.data = data;
      markInitialDataStep();
    });
    const assetMapPromise = loadAssetMap0427()
      .then((assetMap) => {
        state.assetMap0427 = assetMap;
        markInitialDataStep();
        return assetMap;
      })
      .catch((error) => {
        debugAssetWarning("asset-map-0427", error);
        state.assetMap0427 = null;
        markInitialDataStep();
        return null;
      });
    const level1VisualMapPromise = loadLevel1VisualMap0427()
      .then((visualMap) => {
        state.level1VisualMap0427 = visualMap;
        markInitialDataStep();
        return visualMap;
      })
      .catch((error) => {
        debugAssetWarning("level1-visual-map-0427", error);
        state.level1VisualMap0427 = null;
        markInitialDataStep();
        return null;
      });

    await Promise.all([
      runtimeDataPromise,
      assetMapPromise,
      level1VisualMapPromise,
      i18nEnPromise,
    ]);

    await preloadAssetKeys(initialAssetKeys, {
      timeoutMs: INITIAL_CRITICAL_PRELOAD_TIMEOUT_MS,
      onLoaded: applyOpeningAsset,
      onProgress: (_percent, done) => updateInitialProgress(done),
    });
    updateInitialLoaderProgress(100);

    assetManifestPromise.then((assetManifest) => {
      state.assetManifest = assetManifest;
      preloadAudioAssets();
    });
    state.collection = loadCollection();
    renderIssueButtons();
    applyNavigationIconAssets();
    updateLanguageControls();
    updateLocalizedStaticText();
    updateCollectionButton();
    updateSacrificeSlots();
    els.enterDoorBtn.disabled = false;
    els.openingStatus.textContent = "雨还在下，门已经虚掩。";
    els.enterDoorBtn.addEventListener("click", startOpeningStreetTransition);
    els.catIntroScreen.addEventListener("click", continueIntro);
    els.expandedCardFlowBtn.addEventListener("click", showCategorySelection);
    els.cardFlowBackBtn.addEventListener("click", handleCardFlowBack);
    els.level1HomeBtn.addEventListener("click", handleLevel1HomeClick);
    els.level1ReturnBtn.addEventListener("click", handleNavigationReturnClick);
    els.globalHomeBtn.addEventListener("click", handleGlobalHomeClick);
    els.globalReturnBtn.addEventListener("click", handleNavigationReturnClick);
    els.globalLanguageBtn.addEventListener("click", toggleLanguage);
    els.level1LanguageBtn.addEventListener("click", toggleLanguage);
    els.tasteGetBtn.addEventListener("click", handleTasteGetClick);
    els.tasteReturnBtn.addEventListener("click", handleTasteReturnClick);
    els.shopStreetBuildings.addEventListener("click", handleShopStreetClick);
    els.shopStreetReturnBtn.addEventListener("click", returnFromShopStreetToCardFlow);
    els.collectionBookButton.addEventListener("click", openCollectionBook);
    els.collectionBookClose.addEventListener("click", closeCollectionBook);
    els.collectionBookOverlay.addEventListener("click", (event) => {
      if (event.target === els.collectionBookOverlay) closeCollectionBook();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.collectionBookOverlay.hidden) {
        closeCollectionBook();
      }

      if (
        state.screen === "cat_intro"
        && event.target !== els.introContinueBtn
        && (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        advanceCatMasterSpeechIntro();
      }
    });
    els.sacrificeSlots.forEach((slot, index) => {
      slot.addEventListener("click", () => clearSacrificeSlot(index));
    });
    els.submitBtn.addEventListener("click", submitSelection);
    els.resultActionBtn.addEventListener("click", handleResultAction);
    hideInitialLoader();
    startBackgroundAssetPreload();
  } catch (error) {
    console.error(error);
    els.enterDoorBtn.disabled = true;
    els.openingStatus.textContent = "猫大师今天打烊了，CSV 编译数据没加载出来。";
    els.riddleBox.textContent = "猫大师今天打烊了，CSV 编译数据没加载出来。请先运行 node scripts/compile-csv-to-runtime.js。";
    applyLongTextClass(els.riddleBox, els.riddleBox.textContent, 34);
    hideInitialLoader();
  }
}

init();
