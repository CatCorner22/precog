-- A client whose conflicts nobody has counted yet has no open-conflict figure,
-- not zero. Rows written only for the owner's address or the report-sent stamp
-- now leave open_findings null until the firm page counts the conflicts.
alter table engagement_marks alter column open_findings drop not null;
alter table engagement_marks alter column open_findings drop default;
