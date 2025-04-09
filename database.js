const Database = require("better-sqlite3");
const db = new Database("data.db");

// Création des tables si elles n'existent pas
db.exec(`
  CREATE TABLE IF NOT EXISTS equipements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      stock INTEGER NOT NULL,
      categorie_id INTEGER, 
      FOREIGN KEY(categorie_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS kits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL UNIQUE,
      description TEXT
  );

  CREATE TABLE IF NOT EXISTS kit_composition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kit_id INTEGER NOT NULL,
      equipementId INTEGER NOT NULL,
      quantite INTEGER NOT NULL,
      FOREIGN KEY(kit_id) REFERENCES kits(id),
      FOREIGN KEY(equipementId) REFERENCES equipements(id)
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
// Vérifie si la colonne "stock" existe dans la table kits sinon l'ajoute
const kitColumnExists = db.prepare("PRAGMA table_info(kits)").all().some(col => col.name === "stock");
if (!kitColumnExists) {
  db.exec("ALTER TABLE kits ADD COLUMN stock INTEGER DEFAULT 0;");
}
// Vérifier si la colonne "kitId" existe dans la table locations
const kitIdExists = db
  .prepare("PRAGMA table_info(locations)")
  .all()
  .some(col => col.name === "kitId");

if (!kitIdExists) {
  db.exec("ALTER TABLE locations ADD COLUMN kitId INTEGER;");
}
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

  // Pour chaque catégorie, récupérer les items appropriés
  return categories.map((categorie) => {
    let items = [];
    if (categorie.nom.toLowerCase() === "kit") {
      // Pour la catégorie "kit", récupérer les kits avec le stock depuis la table kits
      items = db.prepare("SELECT id, nom, description, stock FROM kits").all();
    } else {
      // Pour les autres catégories, récupérer les équipements de la table equipements
      items = db.prepare("SELECT id, nom, stock FROM equipements WHERE categorie_id = ?")
                .all(categorie.id);
    }
    
    return {
      categorie: categorie.nom,
      equipements: items // ici items est bien un tableau
    };
  });
}

function deleteKitFromStock(kitId) {
  // Récupérer la composition du kit
  const composition = db.prepare(`
    SELECT equipementId, quantite
    FROM kit_composition
    WHERE kit_id = ?
  `).all(kitId);

  // Pour chaque composant, rétablir le stock de l'équipement
  composition.forEach(item => {
    db.prepare(`
      UPDATE equipements
      SET stock = stock + ?
      WHERE id = ?
    `).run(item.quantite, item.equipementId);
  });

  // Supprimer la composition du kit
  db.prepare(`
    DELETE FROM kit_composition
    WHERE kit_id = ?
  `).run(kitId);

  // Supprimer le kit lui-même
  db.prepare(`
    DELETE FROM kits
    WHERE id = ?
  `).run(kitId);
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
  const equipmentLocations = db.prepare(`
    SELECT l.id, e.nom AS equipement, l.locataire, l.date_prise, l.date_retour, l.quantite, l.status
    FROM locations l
    JOIN equipements e ON l.equipementId = e.id
    WHERE l.status = 'active'
  `).all();
  
  const kitLocations = db.prepare(`
    SELECT l.id, k.nom AS equipement, l.locataire, l.date_prise, l.date_retour, l.quantite, l.status
    FROM locations l
    JOIN kits k ON l.kitId = k.id
    WHERE l.status = 'active'
  `).all();
  
  return equipmentLocations.concat(kitLocations);
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
function addKitLocation(kitId, locataire, date_prise, date_retour, quantite) {
  // Récupérer le kit pour vérifier le stock
  const kit = db.prepare("SELECT * FROM kits WHERE id = ?").get(kitId);
  if (!kit) {
    throw new Error("Kit introuvable.");
  }
  if (kit.stock < quantite) {
    throw new Error(`Stock insuffisant pour le kit ${kit.nom}. Stock disponible : ${kit.stock}, requis : ${quantite}`);
  }

  const today = new Date();
  const priseDate = new Date(date_prise);
  let status = 'active';
  if (priseDate > today) {
    status = 'reservation';
  }
  
  // Déduire le stock du kit
  if (status === 'active') {
    db.prepare("UPDATE kits SET stock = stock - ? WHERE id = ?").run(quantite, kitId);
  }
  
  // Insertion de la location en enregistrant l'ID du kit
  db.prepare(`
      INSERT INTO locations (kitId, locataire, date_prise, date_retour, quantite, status)
      VALUES (?, ?, ?, ?, ?, ?)
  `).run(kitId, locataire, date_prise, date_retour, quantite, status);
}



function returnLocation(locationId) {
  // Récupérer la location sans jointure pour avoir accès à kitId et equipementId
  const location = db.prepare("SELECT * FROM locations WHERE id = ?").get(locationId);
  if (!location) {
    throw new Error("Location introuvable.");
  }

  // Si la location est active, mettre à jour le stock et enregistrer dans l'historique
  if (location.status === 'active') {
    if (location.kitId) {
      // Mise à jour du stock du kit en incrémentant le stock dans la table kits
      db.prepare("UPDATE kits SET stock = stock + ? WHERE id = ?")
        .run(location.quantite, location.kitId);
      
      // Enregistrer dans l'historique avec le nom du kit
      const kit = db.prepare("SELECT nom FROM kits WHERE id = ?").get(location.kitId);
      db.prepare(`
        INSERT INTO historique (equipement, locataire, date_prise, date_retour, quantite)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        kit ? kit.nom : "Kit inconnu",
        location.locataire,
        location.date_prise,
        location.date_retour,
        location.quantite
      );
    }
     else {
      // Cas d'une location d'équipement individuel
      if (location.equipementId) {
        db.prepare(`
          UPDATE equipements
          SET stock = stock + ?
          WHERE id = ?
        `).run(location.quantite, location.equipementId);
        
        // Récupérer le nom de l'équipement pour l'historique
        const equip = db.prepare("SELECT nom FROM equipements WHERE id = ?").get(location.equipementId);
        db.prepare(`
          INSERT INTO historique (equipement, locataire, date_prise, date_retour, quantite)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          equip ? equip.nom : "Équipement inconnu",
          location.locataire,
          location.date_prise,
          location.date_retour,
          location.quantite
        );
      }
    }
  }
  
  // Supprimer la location (qu'elle soit active ou une réservation)
  db.prepare("DELETE FROM locations WHERE id = ?").run(locationId);
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
function createKit(nom, description) {
  const stmt = db.prepare(
    `INSERT INTO kits (nom, description) VALUES (?, ?)`
  );
  const info = stmt.run(nom, description);
  return info.lastInsertRowid; // retourne l'ID du kit créé
}
function addKitComponent(kitId, equipementId, quantite) {
  db.prepare(
    `INSERT INTO kit_composition (kit_id, equipementId, quantite) VALUES (?, ?, ?)`
  ).run(kitId, equipementId, quantite);
}
function createKitWithComponents(nom, description, composants, kitQuantity = 1) {
  // Vérifier la disponibilité de chaque composant pour kitQuantity unités
  composants.forEach(item => {
    const equip = db.prepare("SELECT stock, nom FROM equipements WHERE id = ?").get(item.equipementId);
    if (!equip) {
      throw new Error(`Équipement avec l'ID ${item.equipementId} introuvable.`);
    }
    if (equip.stock < item.quantite * kitQuantity) {
      throw new Error(`Stock insuffisant pour ${equip.nom}. Stock disponible : ${equip.stock}, requis : ${item.quantite * kitQuantity}`);
    }
  });
  
  // Créer le kit avec le stock initial défini à kitQuantity
  const stmt = db.prepare(`INSERT INTO kits (nom, description, stock) VALUES (?, ?, ?)`);
  const info = stmt.run(nom, description, kitQuantity);
  const kitId = info.lastInsertRowid;

  // Pour chaque composant, déduire le stock et enregistrer la composition
  composants.forEach(item => {
    db.prepare("UPDATE equipements SET stock = stock - ? WHERE id = ?")
      .run(item.quantite * kitQuantity, item.equipementId);
      
    // Enregistrer la composition du kit
    addKitComponent(kitId, item.equipementId, item.quantite);
  });
  
  return kitId;
}


function getRentableItems() {
  // Récupérer les équipements individuels
  const equipements = db.prepare("SELECT id, nom, stock FROM equipements").all();
  // Récupérer les kits
  const kits = db.prepare("SELECT id, nom, description FROM kits").all();

  // Marquer chaque article avec un type (equipment ou kit)
  const equipmentsWithType = equipements.map(e => ({ ...e, type: "equipment" }));
  const kitsWithType = kits.map(k => ({ ...k, type: "kit" }));

  // Retourner la concaténation des deux listes
  return equipmentsWithType.concat(kitsWithType);
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
  createKitWithComponents,
  deleteKitFromStock,
  addKitLocation,
  getRentableItems,
};