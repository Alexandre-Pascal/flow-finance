-- Flow Finance — nom d'affichage des comptes
-- Les banques nomment les comptes d'après leur titulaire : deux comptes
-- Revolut s'appellent « Alexandre Pascal », on s'y perd. L'utilisateur peut
-- donc les renommer.
--
-- Le nom d'origine reste : c'est lui qui permet de reconnaître un virement
-- entre comptes dans un libellé (« VIREMENT EMIS WEB M. PASCAL ALEXANDRE »).
-- Le renommer casserait la détection.

alter table public.accounts
  add column if not exists display_name text;
