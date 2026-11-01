# Personal Budgeting Web-App

### General overview and feature scope

* The user can create custom budgets for varying expense categories. For example, if the user wants to set a spending limit for groceries each week to 50 dollars he would be able to create such a budget, with an option to add a description if the expense category is vague.
* The goal is for the user to be in complete control over his expenses and all of his purchases are calculated and within his means.
* Custom budgets are able to be set for custom intervals (yearly, monthly, weekly etc.).
* The user should be able to log prospective purchases to be made and assign them to certain categories, this should allow the user to visualize the future cost and apply it to his current spending.
* The user can add an estimate cost range for the product (e.g. Winter coat, 100 - 150) with both numbers reflecting the high and low end of his budget respectively.
* The user would also be able to tag the item as an essential item to further aid the user to visualize which items should fit into his budget.
* For each custom budget the user has created he should be able to view the percentage of the budget he is currently holding this includes if he exceeds the budget (e.g. if his budget was 100$ per week for groceries, and instead he spent 110$ dollars the percent display should indicate 110%). Also, the user should be able to expand the view of each custom budget to view all the purchases in that category, in that time range). The app should be integrated together with banking apps (plaid or possibly some other method, that can live track incoming purchases) and, receive all purchases (posted and pending) and related info about the purchase. There should also be a method for manually entering certain purchases that can't be automated like cash purchases etc. there should be a feature for scanning receipts, and automatically logging all purchases together with the dates, descriptions and other relevant info (will be fully discussed at a later point). In order to ensure that this actually works but at the same time not to fall into the trap of other apps that promise to help organize for disorganized people they tend to overpromise the capabilities of their automation, this will make the flow of logging the information so seamless that it removes much of the cognitive load to allow the disorganized user to easily ensure that the information is relevant and never goes stale as follows: In an inbox which serves as a bucket for the current weeks purchases (default is for a week and the starting point is sunday although both of these can change (meaning the inbox can show different time ranges). The users job is to reconcile each weeks inbox. Nothing is automated, all the purchases in the inbox are showing all the relevant information that can be pulled programmatically via plaid or any other means, for example, if a user bought a toothbrush from a store called Kahan's for 2.53 then that purchase should show up in his inbox, that user would then click on that purchase and add it to the essentials budget. I think that the user should also train the system over time to better understand his purchases for example if a purchase for 2.53 from Kahan's comes into the inbox the user should have the option to log what the purchase item is and it's category, now, the next time the purchase comes in from the same store and the same price the system either via AI or some more deterministic method should have much more confidence what the purchase is and should what the purchase is and what category it should enter (In this case it would probably fall under groceries). The app should come with some preset expense categories for budgeting, Essentials, Recreation, Travel, Personal Care, Housing Education (Not sure yet if the budget categories should be able to overlap). There should be an option for the user to create additional groups, with the option to give it a title, (description of the category mandatory for the algorithm to understand the group in more detail to decide whether to suggest it as a possible match for a purchase. There should some redundant categories for the user to view for example a unified subscriptions section which would allow the user to see across all accounts and view active and past subscriptions (possible for a later version we can add the ability to easily cancel the subscription through the app). Additionally another feature that this can have is to allow the user to **comment** on certain expenses that are vague for example a 200 charge on your card that is a mystery to the user can be commented as a speeding ticket if otherwise unknown).

User should have the ability to rank purchases in terms of priority in terms of how essential it was. Potentially via a slider that can sort of rank between a set range.

User should be able to select individual purchases either from the weekly inbox of unreconciled purchases that are pulled from credit and debit card transactions.

* IMPORTANT: The app should take priority to accurately attribute the correct intent and purpose of money transfers like Zelle, PayPal, bank transfers etc. and allow user to tag and explain different incoming or outgoing Zelles. This should be done PROACTIVELY IN FACT. All money transfers of this like should not be considered income or an expense until verified by the client. and should be considered pending otherwise
* Pending purchases should be reflected as such via a visual indicator in the personal budget group (for example in the visual spend bar for each group. This is one of my personal pain points with banking apps that oftentimes a large purchase can be considered as pending for a while and give the user a misleading image of his net worth or whether he is within his budget
* When a user logs a purchase manually the app should indicate visually (or textually) that the purchase is not yet verified) a purchase would only be verified once the app pulls a matching transaction posted that matches the receipt data (more specifically, the number should match exactly if not it should inform the user).
* Once the user scans the receipt and is processed, an artistic rendering of the receipt (a bit crumpled for style) appears with editable text sections over text areas to allow the user to review the scan quality and edit if need be. As well as the ability to view the original receipt.
* Another important feature is to kind of integrate a type of IOU functionality into the app. The following use case should bring out why: I go to target and I buy some shampoo for myself, I also buy a friend a chocolate bar. When I scan the receipt I want to be able to click on the chocolate bar item and link it to my friend (via either his number or some other method to be decided) as an IOU, with a separate page for me my IOU's
* Since sometimes receipts don't actually give a descriptive name for the item, the user should be able to manually input the item name for such a purchase, and the system should automatically (if the circumstances are with 100% certainty) in the future link that code on the receipt together with the user provided info.
* In addition to prompting the user to upload a photo of the receipt there should be a mechanism for detecting email receipts, and parsing them taking care to do this in a way that there is redundancies and ensuring the information is accurate.
* If possible, the app should be able to detect if a transaction has taken place and prompt the user to log the purchase in the app.
* I currently can't think of a good method to handle this, but there should be a way to handle withdrawing money in terms of how to categorize this expense and when to do it. I suppose right now that whenever a withdrawal is made it should prompt the user to describe and categorize what the money is for and should easily allow the user to split the sum into smaller parts.
* An AI assistant should be created that will specialize in advising the user through different purchases and based on their spending goals, net worth income and most importantly budget help decide whether they can said item.
* An MCP endpoint should be created to allow the user to access their budgeting information via their personal AI agent.
* A few points on the feature for logging future purchases (wish-list): When a user saves away for a future purchase, it's important that the money is physically transferred to an account, optionally, the account should be locked and only be unlocked once the amount of money has been saved up. It should have live price-tracking. The user should be able to past a link of the item and the app should automatically detect the item, upload an image of the item (or an icon of the item in the friendly spatial theme).
* Another feature could be a pending return feature where items are supposed to be returned can be manually logged by referencing the earlier purchase and this can be reflected visually to show to the user that the item is pending to be returned as well as a reminder for the user to return the item and it should indicate programmatically when the item has been successfully returned
* To be clear, separately from the inbox the user should be able to view his entire history of past transaction with the option of expanding each transaction to each one in more detail.
* Possibly a user can scan the receipt and the app can automatically try and see if the input matches a transaction that was already in the inbox (skipping the process of selecting an item and adding the receipt to that item individually)







### User experience and app flow

##### Mobile

##### General design preferences

* Theme should be Friendly Spatial, Minimalist and calming style.
* ChatGPT's summary of the visual style (subject to change): A calm, playful mobile interface with icy blue backgrounds, floating white cards, generous rounded corners, and soft shadows. Bold navy typography, vivid blue pill buttons, and small dimensional icons with a soft clay finish create a tactile feel. Spacious, polished, and easy to scan, with subtle gradients and restrained pastel accents.
* Should be haptic friendly, take advantage of apples haptic system make the app experience feel like a fun experience.
* When a new purchase is logged the progress bar should grow in a fun animation
* Should be careful to avoid verbal redundancies (emphasizing the same idea multiple times in the same page when once suffices)
* User should be able to delete planned purchases by clicking an edit button.
* When displaying the amount of money remaining in the budget above the spending bar the default amount should include the amount set aside for planning (I'm still hesitant about this)
* In the planned purchases, since we're going to have a feature where a user can send excess money unspent from a budget towards a planned purchases we should implement an independent progress bar for it to indicate to the user how much money has been put away from
* In the inbox, for each new transaction the user should able to select the transaction, there should be a button near the bottom underneath the transactions section called "Scan Receipt" which, when pressed, should open up the phone's camera to scan the receipt. As well as another button to record a purchase manually.
* The user should be able to search through past transactions

### Tech Stack and dependencies

Plaid (bank connection)

## Instructions for AI

