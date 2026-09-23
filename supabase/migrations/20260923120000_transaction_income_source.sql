-- Flow Finance — rattacher une rentrée à la main
-- Une rentrée est reconnue par mots-clés (salaire, sources suivies). Quand le
-- libellé ne s'y prête pas, l'utilisateur rattache la transaction lui-même :
-- « payroll » pour le salaire, sinon l'identifiant de la source suivie.
-- La colonne vide laisse la détection automatique faire son travail.

alter table public.transactions
  add column if not exists income_source text;
