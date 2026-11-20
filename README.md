# Ressenti

Cette application en français permet de compléter son journal le soir, à raison d’un compteur par symptôme et par journée. Elle conserve les brouillons, permet de corriger les anciennes journées et distingue une journée sans symptôme d’une journée non renseignée. Le rapport récapitule les occurrences et le nombre de jours concernés sur la période sélectionnée.

## Publier sur GitHub Pages

1. Décompressez l’archive et placez les fichiers du projet à la racine de votre dépôt GitHub. Le dépôt doit notamment contenir le dossier `docs/`, avec `docs/index.html` et `docs/.nojekyll`.
2. Sur GitHub, ouvrez **Settings → Pages**. Sous **Build and deployment**, choisissez **Deploy from a branch**, sélectionnez `main` (ou votre branche principale) et `/docs`, puis cliquez sur **Save**.
3. Une fois la publication terminée, ouvrez l’adresse affichée dans **Settings → Pages** sur son téléphone. Pour un dépôt de projet, l’adresse ressemble à `https://thomeksolutions.github.io/ressenti/`. Utilisez HTTPS et gardez la même adresse après le premier enregistrement.
4. Sur iPhone, ouvrez l’adresse dans Safari, puis choisissez **Partager → Sur l’écran d’accueil** et **Ouvrir comme app web** si l’option apparaît. Sur Android, choisissez **Installer l’application** dans le menu de Chrome. Lancez l’app installée en ligne une première fois avant de passer en mode avion.

GitHub Pages sert directement les fichiers de `docs/`. Aucun outil de build, secret ou serveur applicatif n’est nécessaire pour la publication. Les chemins sont relatifs et fonctionnent dans le sous-dossier d’un dépôt. Le workflow **Tests** vérifie le code à chaque push et pull request.

[Guide officiel de configuration de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Utiliser le journal

- **Journée**. Ajoutez un symptôme avec vos propres mots. La case des favoris est cochée à la première saisie et peut être décochée pour une entrée ponctuelle. Utilisez les boutons moins et plus, ou saisissez directement le nombre. Les notes sont facultatives. Validez avec **Enregistrer la journée** ou **Rien à signaler**.
- **Historique**. Touchez une date pour revoir ou modifier sa saisie. Les brouillons sont conservés. En cas de modification en cours d’une journée déjà enregistrée, le rapport utilise sa dernière version validée.
- **Rapport**. Choisissez les dates, relisez le résumé et le détail, puis téléchargez le PDF. L’option de partage direct apparaît lorsque le navigateur accepte le partage de fichiers.
- **Réglages**. Personnalisez les favoris et exportez la sauvegarde JSON dans un emplacement privé. Pour changer de téléphone ou d’adresse, exportez depuis l’ancienne installation et restaurez le fichier dans la nouvelle. Une restauration remplace le contenu actuel après confirmation.

## Données et confidentialité

Le journal repose sur IndexedDB et les fichiers de l’application sont mis en cache par un *service worker*. L’app fonctionne hors ligne après le premier chargement complet. Aucun compte, suivi d’audience, stockage serveur ou appel à une bibliothèque distante. Le PDF (police latine couvrant le français) et le fichier de sauvegarde sont créés sur le téléphone. Le fichier JSON conserve le texte original.

Publiez uniquement le code sur GitHub. Les PDF et JSON de sauvegarde contiennent des données personnelles. Conservez une copie privée en dehors du stockage du navigateur, que l’on peut perdre en effaçant les données du site ou en changeant d’appareil. Il est conseillé d’utiliser l’icône installée pour toute la saisie. Selon le navigateur et le système, l’onglet et l’app installée peuvent avoir des espaces de stockage distincts.

Sur GitHub Pages, les sites sous différents sous-dossiers d’un même domaine peuvent partager la même origine web. Si vous publiez aussi des scripts tiers ou du code moins fiable sous ce domaine, utilisez une origine distincte pour ce journal dès le premier déploiement, par exemple un sous-domaine personnalisé réservé à cette app.

## Développer et vérifier

Avec Node.js 24 LTS, depuis le dossier du projet :

```sh
npm run dev
```

L’adresse locale est `http://127.0.0.1:4173/ressenti/`. Évitez d’ouvrir directement `index.html` depuis l’explorateur de fichiers.

```sh
npm ci
npm test
npx playwright install chromium webkit
npm run test:e2e
```

Sur Linux, ajoutez `--with-deps` à la commande Playwright si les dépendances système des navigateurs manquent. Les tests utilisent des données fictives et exécutent les parcours sur des profils mobiles Chromium et WebKit.

Après une modification de `docs/`, lancez `npm run prepare:site` et incluez `docs/sw.js` dans le commit. La commande `npm run check:site` détecte un cache obsolète. Pour laisser une mise à jour s’activer, fermez les fenêtres de l’app puis rouvrez-la. La mise à jour du cache et le journal IndexedDB sont indépendants.

Les fichiers mis en cache incluent jsPDF et Noto Sans, dont les licences sont dans `docs/vendor/`. Ils sont déjà présents dans le dépôt. Le script facultatif `scripts/make-assets.py` régénère les icônes et le fichier TTF embarqué à partir du paquet de police installé. Il utilise Pillow et fontTools.
