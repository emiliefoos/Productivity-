// classifier.js — suggestions de tags automatiques, 100% sur l'appareil.
// Charge TensorFlow.js + MobileNet à la demande (mis en cache par le navigateur/service worker
// après le premier téléchargement) et reconnaît le contenu visuel des photos/vidéos importées.

const TFJS_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js";
const MOBILENET_URL = "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js";

let loadPromise = null;
let modelPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function ensureLibs() {
  if (!loadPromise) {
    loadPromise = (async () => {
      if (!window.tf) await loadScript(TFJS_URL);
      if (!window.mobilenet) await loadScript(MOBILENET_URL);
    })();
  }
  return loadPromise;
}

export async function isAvailable() {
  if (!navigator.onLine && !window.mobilenet) return false;
  return true;
}

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await ensureLibs();
      return window.mobilenet.load({ version: 2, alpha: 1.0 });
    })();
  }
  return modelPromise;
}

// Nettoie et traduit quelques libellés ImageNet fréquents vers un français plus lisible.
// Le reste est retourné "nettoyé" (underscores -> espaces) pour rester exploitable en recherche.
const FR_DICT = {
  seashore: "plage", lakeside: "bord de lac", cliff: "falaise", valley: "vallée",
  alp: "montagne", volcano: "volcan", sky: "ciel", cloud: "nuages",
  street_sign: "panneau de rue", traffic_light: "feu tricolore", "car": "voiture",
  sports_car: "voiture de sport", taxi: "taxi", bus: "bus", bicycle: "vélo",
  motor_scooter: "scooter", airliner: "avion", train: "train",
  restaurant: "restaurant", coffee_mug: "tasse de café", cup: "tasse",
  espresso: "café", plate: "assiette", pizza: "pizza", ice_cream: "glace",
  keyboard: "clavier", laptop: "ordinateur portable", cellular_telephone: "téléphone",
  desk: "bureau", desktop_computer: "ordinateur", microphone: "micro",
  studio_couch: "canapé", television: "télévision", bookshop: "librairie",
  library: "bibliothèque", office: "bureau", conference_room: "salle de réunion",
  hand_blower: "sèche-mains", umbrella: "parapluie", sunglasses: "lunettes de soleil",
  hat: "chapeau", jean: "jean", running_shoe: "chaussures de sport",
  basketball: "basketball", soccer_ball: "ballon de foot", racket: "raquette",
  dog: "chien", cat: "chat", bird: "oiseau", horse: "cheval",
  flower_pot: "pot de fleurs", daisy: "fleur", rose: "rose",
  forest: "forêt", tree: "arbre", grass: "herbe",
  fountain: "fontaine", castle: "château", palace: "palais",
  church: "église", stadium: "stade", skyscraper: "gratte-ciel",
  boat: "bateau", speedboat: "bateau à moteur", canoe: "canoë",
  guitar: "guitare", piano: "piano", violin: "violon",
  microphone_stand: "pied de micro", stage: "scène",
};

function cleanLabel(raw) {
  const primary = raw.split(",")[0].trim();
  const key = primary.toLowerCase().replace(/\s+/g, "_");
  if (FR_DICT[key]) return FR_DICT[key];
  return primary.toLowerCase().replace(/_/g, " ");
}

export async function suggestTags(imageSource, { topK = 4, minProbability = 0.12 } = {}) {
  try {
    const model = await getModel();
    const predictions = await model.classify(imageSource, topK);
    return predictions
      .filter((p) => p.probability >= minProbability)
      .map((p) => cleanLabel(p.className))
      .filter((label, idx, arr) => label && arr.indexOf(label) === idx);
  } catch (err) {
    console.warn("Suggestion IA indisponible :", err);
    return [];
  }
}
