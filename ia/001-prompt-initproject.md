-- Generated in OpenCode With DeepSeek V4.1 Flash


The aim is to create an application named raccoonbank from scratch to handle personnal (single user) finances.
The application has to be written in java spring boot for the backend and jquery+d3.js for the frontend.
The data has to travel between frontend and backend through REST API
The data has to be stored as plain csv files

# Data
## Bank statements
The bank provide .ofx files to the user that list statements.
A statements has the following fields:
TRNTYPE,DTPOSTED,TRNAMT,FITID,NAME

## Transactions
The file transactions.csv constains all the transactions (or statements) with the following header:
Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Description,Bill_Id


## Transaction Categories
The file categories.csv constains all the categories with the following header:
Id,Name,Color

## Default Categories
The file defaultcategories.csv constains all the transactions (or statements) with the following header:
Id,Category_Id,Pattern

# User story
# Import new bank statements
 - The user can download an OFX file containing one or more bank statements from its bank website.
 - The user open the application raccoonbank
 - The user click the "Import OFX" button
 - The user select the .ofx file to import via a dialog box
 - The selected file importation process starts
	- raccoonbank convert the statements into transactions
		- OFX.TRNTYPE is mapped to Transaction.PaymentType
		- OFX.DTPOSTED is mapped to Transaction.BankDate
		- OFX.TRNAMT is mapped to Transaction.Amount
		- OFX.NAME contains the Transaction.Title followed by the Transaction.RealDate with the date format dd/MM/yy
	- If the Transaction.Title starts with any defaultcategories.Pattern, the Transaction.Category_Id is set the defaultcategories.Category_Id
	  Else it is set to 0
 - The resulting list of transactions is displayed in a table to the user
	- The Transaction.Category_Id value is displayed as the matching Categories.Name with the Categories.Color as a background color. The foreground color is adjusted according to the background color to ensure a correct contrast.
 - The user can edit each field of the table.
 - The user can click the save all transactions button
	- This add all the displayed transactions at the end of the transactions.csv file and save it.
	- The interface returns to the home page