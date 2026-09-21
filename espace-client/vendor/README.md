# vendor/

`supabase.js` — bibliothèque cliente Supabase, servie par le site plutôt que par un CDN,
pour qu'aucune requête ne parte vers un tiers quand un client ouvre son espace.

**Ce fichier n'est pas dans Git tant qu'il n'a pas été déposé.** Pour l'obtenir :

```
npm pack @supabase/supabase-js
tar -xzf supabase-supabase-js-<version>.tgz package/dist/umd/supabase.js
```

puis copier `package/dist/umd/supabase.js` ici, sous le nom `supabase.js`.

À refaire une à deux fois par an : en figeant la bibliothèque, on ne reçoit plus
ses correctifs automatiquement — et il s'agit du code d'authentification.
