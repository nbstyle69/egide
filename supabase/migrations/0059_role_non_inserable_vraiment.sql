-- Migration 0059 : fermer vraiment l'escalade de privilège ouverte à l'insertion
--
-- POURQUOI UNE SECONDE MIGRATION. La 0058 écrivait
-- `revoke insert (role) on public.profiles from authenticated, anon` et
-- **ne changeait rien** : l'assertion qui suivait a remis la main sur un
-- `role = 'admin'` inséré sans broncher.
--
-- LA RAISON, et c'est la leçon à retenir : `profiles` portait encore un
-- `GRANT INSERT` **au niveau de la table**, hérité de la 0001. Un droit de
-- table couvre toutes les colonnes, présentes et à venir ; retirer le droit
-- d'une colonne ne l'entame pas. Pour restreindre par colonne, il faut
-- d'abord retirer le droit de table, puis ré-accorder colonne par colonne —
-- exactement ce que la 0028 avait fait pour `UPDATE`, et que personne
-- n'avait fait pour `INSERT`.
--
-- LA FAILLE QUE CELA LAISSAIT. Tout compte fraîchement créé pouvait écrire
-- son propre profil avec `role = 'admin'` et obtenir l'administration de la
-- plateforme : annuler les tournois d'autrui, désactiver des comptes,
-- dissoudre des équipes. Le trou s'ouvrait à l'écran de création de profil,
-- c'est-à-dire au premier geste de tout nouvel inscrit.
--
-- Liste de colonnes reprise telle quelle de la 0028 : `id` y figure parce que
-- le client l'envoie dans son upsert de création — le retirer casserait
-- l'inscription. Seul `role` est laissé de côté. Sa valeur par défaut est
-- `'user'`, donc un insert qui ne le mentionne pas continue de fonctionner.
--
-- RÈGLE PERMANENTE : restreindre une colonne sensible, c'est traiter
-- **les deux verbes**. Un `UPDATE` verrouillé et un `INSERT` ouvert laissent
-- la porte entrebâillée, et elle se pousse à la création, quand personne ne
-- regarde. Vérifier `information_schema.role_table_grants` avant de croire
-- qu'un `revoke` par colonne a produit un effet.

revoke insert on public.profiles from authenticated, anon;

grant insert (id, pseudo, region, faction_favorite, created_at, updated_at,
              notify_region, notify_registrations)
  on public.profiles to authenticated, anon;
