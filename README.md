# TICE 6e — Séance 6

## Writer : laboratoire du texte

Mini-site autonome en HTML, CSS et JavaScript pour une séance de 55 minutes en classe de 6e.

### Contenu

- 7 défis progressifs et un bonus chronométré facultatif ;
- réponses des questionnaires mélangées à chaque nouvelle situation ;
- fausse interface LibreOffice Writer manipulable à la souris et au clavier ;
- sélection fidèle à Writer : clic simple pour le curseur, double-clic pour un mot, triple-clic pour une phrase, glisser-sélectionner et Ctrl+A ;
- aides intégrées sans quitter les défis ;
- score, feedback immédiat, badges et possibilité de recommencer une étape ;
- sauvegarde locale de la progression avec `localStorage` ;
- bilan détaillé avec résultats par compétence et conseils personnalisés ;
- feuille d’impression A4 dédiée au bilan.

### Utilisation locale

Ouvrir `index.html` dans un navigateur récent. Aucun compte, serveur, téléchargement supplémentaire ni connexion Internet n’est nécessaire.

Pour repartir de zéro, utiliser le bouton **Nouvelle mission** sur le bilan ou le bouton **Nouvelle mission** proposé sur l’accueil quand une sauvegarde existe.

### Mise en ligne avec GitHub Pages

1. Créer un nouveau dépôt GitHub, par exemple `seance-6-writer`.
2. Envoyer à la racine du dépôt les fichiers `index.html`, `style.css`, `script.js` et, si souhaité, ce `README.md`.
3. Dans le dépôt, ouvrir **Settings**, puis **Pages**.
4. Dans **Build and deployment**, choisir **Deploy from a branch**.
5. Sélectionner la branche `main`, le dossier `/ (root)`, puis enregistrer.
6. Attendre quelques instants : GitHub affiche ensuite l’adresse publique du mini-site.

### Personnalisation rapide

- Les couleurs principales se trouvent au début de `style.css`, dans le bloc `:root`.
- Les questions et consignes sont regroupées dans les tableaux situés au début des sections correspondantes de `script.js`.
- Le texte du pied de page est présent à la fin de `index.html`.
- Les seuils du bilan sont définis dans la fonction `statusFor` de `script.js` : **Acquis** à partir de 80 %, **En cours** à partir de 50 %, sinon **À revoir**.

### Impression du bilan

Terminer la mission, compléter si besoin les champs Nom, Prénom et Classe, puis cliquer sur **Aperçu / Imprimer le bilan**. Seule la section bilan est imprimée, en A4 portrait.
