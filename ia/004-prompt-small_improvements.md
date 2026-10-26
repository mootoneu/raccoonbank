Add the following changes:
 - The field Bill_Id of Transaction must be a string
 - When the application starts, a backup copy of the current 3 data files must be saved in "./data/backup/". The application must maintain 3 rolling backups.
 - When reviewing the import of OFX, statements that are already saved as transaction should be highlighted
	- Equality comparaison should include amount, bank date and title
 - When no real date is found, the real date must be set to the bank date.
 - The category dropdown list should display the color of the catergory on each line