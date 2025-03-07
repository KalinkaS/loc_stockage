const Database = require("better-sqlite3");
const db = new Database("data.db");

// Création des tables si elles n'existent pas
db.exec(`
  CREATE TABLE IF NOT EXISTS equipements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      stock INTEGER NOT NULL,
      categorie_id INTEGER, -- Assure-toi que cette ligne existe
      FOREIGN KEY(categorie_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipementId INTEGER,
    locataire TEXT,
    date_prise TEXT,
    date_retour TEXT,
    quantite INTEGER,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS historique (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipement TEXT NOT NULL,
      locataire TEXT NOT NULL,
      date_prise TEXT NOT NULL,
      date_retour TEXT NOT NULL,
      quantite INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL UNIQUE
  );
`);

// Vérifie si la colonne categorie_id existe
const columnExists = db
  .prepare("PRAGMA table_info(equipements)")
  .all()
  .some((col) => col.name === "categorie_id");

if (!columnExists) {
  // Ajoute la colonne si elle n'existe pas
  db.exec("ALTER TABLE equipements ADD COLUMN categorie_id INTEGER;");
}

// Ajout des catégories prédéfinies si elles n'existent pas déjà
const predefinedCategories = [
  "Caméras",
  "Optiques",
  "Énergie",
  "Machinerie",
  "Mémoire et divers",
  "Lumière",
  "Régie",
  "Audio",
  "Câble",
  "Kit",
];

predefinedCategories.forEach((category) => {
  const existing = db
    .prepare("SELECT COUNT(*) AS count FROM categories WHERE nom = ?")
    .get(category);
  if (existing.count === 0) {
    db.prepare("INSERT INTO categories (nom) VALUES (?)").run(category);
  }
});

// Fonctions pour récupérer les catégories
function getCategories() {
  return db.prepare("SELECT * FROM categories").all();
}

// Fonctions pour gérer les équipements
function getEquipements() {
  return db.prepare("SELECT * FROM equipements").all();
}
function getEquipementsParCategorie() {
  // Récupérer toutes les catégories
  const categories = db.prepare("SELECT id, nom FROM categories").all();

  // Récupérer les équipements et les regrouper par catégorie
  return categories.map((categorie) => {
    const equipements = db
      .prepare("SELECT id, nom, stock FROM equipements WHERE categorie_id = ?")
      .all(categorie.id);

    return {
      categorie: categorie.nom,
      equipements: equipements,
    };
  });
}

function addEquipement(nom, stock, categorie_id) {
  db.prepare(
    "INSERT INTO equipements (nom, stock, categorie_id) VALUES (?, ?, ?)"
  ).run(nom, stock, categorie_id);
}

function updateEquipement(id, nom, stock) {
  db.prepare("UPDATE equipements SET nom = ?, stock = ? WHERE id = ?").run(
    nom,
    stock,
    id
  );
}

function deleteEquipement(id) {
  db.prepare("DELETE FROM equipements WHERE id = ?").run(id);
}

// Fonctions pour gérer les locations
function getLocations() {
  return db.prepare(
    `
      SELECT l.id, e.nom AS equipement, l.locataire, l.date_prise, l.date_retour, l.quantite, l.status
      FROM locations l
      JOIN equipements e ON l.equipementId = e.id
      WHERE l.status = 'active'
    `
  ).all();
}



function addLocation(equipementId, locataire, date_prise, date_retour, quantite) {
  const today = new Date();
  const priseDate = new Date(date_prise);
  let status = 'active';
  
  if (priseDate > today) {
    status = 'reservation';
  }

  db.prepare(
    `
      INSERT INTO locations (equipementId, locataire, date_prise, date_retour, quantite, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(equipementId, locataire, date_prise, date_retour, quantite, status);

  if (status === 'active') {
    db.prepare(
      `
        UPDATE equipements
        SET stock = stock - ?
        WHERE id = ?
      `
    ).run(quantite, equipementId);
  }
}


function returnLocation(locationId) {
  // Récupère la location en incluant le statut
  const location = db.prepare(
    `
      SELECT e.nom AS equipement, l.locataire, l.date_prise, l.date_retour, l.quantite, l.status
      FROM locations l
      JOIN equipements e ON l.equipementId = e.id
      WHERE l.id = ?
    `
  ).get(locationId);

  if (!location) {
    throw new Error("Location introuvable.");
  }

  // Si la location est active, mettre à jour le stock et enregistrer dans l'historique
  if (location.status === 'active') {
    db.prepare(
      `
        UPDATE equipements
        SET stock = stock + ?
        WHERE id = (
            SELECT equipementId
            FROM locations
            WHERE id = ?
        )
      `
    ).run(location.quantite, locationId);

    db.prepare(
      `
        INSERT INTO historique (equipement, locataire, date_prise, date_retour, quantite)
        VALUES (?, ?, ?, ?, ?)
      `
    ).run(
      location.equipement,
      location.locataire,
      location.date_prise,
      location.date_retour,
      location.quantite
    );
  }
  
  // Pour une réservation, on ne modifie pas le stock
  // Dans les deux cas, on supprime la location (location active ou réservation)
  db.prepare(`DELETE FROM locations WHERE id = ?`).run(locationId);
}
function cancelReservation(locationId) {
  // Pour une réservation, il suffit de supprimer le record sans toucher au stock ni l'historique
  db.prepare(`DELETE FROM locations WHERE id = ?`).run(locationId);
}


function getHistorique() {
  return db.prepare("SELECT * FROM historique").all();
}
function getReservations() {
  return db.prepare(
    `
      SELECT l.id, e.nom AS equipement, l.locataire, l.date_prise, l.date_retour, l.quantite, l.status
      FROM locations l
      JOIN equipements e ON l.equipementId = e.id
      WHERE l.status = 'reservation'
    `
  ).all();
}


function clearHistorique() {
  db.prepare("DELETE FROM historique").run();
}

// Exporter toutes les fonctions
module.exports = {
  getEquipements,
  getEquipementsParCategorie,
  addEquipement,
  updateEquipement,
  deleteEquipement,
  getLocations,
  addLocation,
  returnLocation,
  getHistorique,
  clearHistorique,
  getCategories,
  cancelReservation,
  getReservations,
};
