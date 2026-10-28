// DPL Auction Night RSVP — creates the Google Form.
// script.google.com → New project → paste → Save → run createAuctionRsvpForm (approve access).
// The form's edit and share links appear in the log (View → Logs).
function createAuctionRsvpForm() {
  const form = FormApp.create('DPL Auction Night — RSVP');
  form.setDescription(
    "Hey, you're invited! 🎾\n\n" +
    "Join us for the Delhi Padel League Auction Night, where the eight franchises build their squads " +
    "and Season One really begins. Come for the bidding, stay for the drinks and good company.\n\n" +
    "6 PM, Sunday 1st November\n" +
    "Dirty Good, One Golden Mile, New Delhi\n\n" +
    "Let us know if you can make it."
  );
  form.setConfirmationMessage("Thanks! We've got your RSVP. See you at Auction Night.");
  form.setCollectEmail(false);

  form.addTextItem().setTitle('Your name').setRequired(true);
  form.addMultipleChoiceItem()
    .setTitle('Will you be attending?')
    .setChoiceValues(["Yes, I'll be there", "Sorry, can't make it"])
    .setRequired(true);

  Logger.log('Edit:  ' + form.getEditUrl());
  Logger.log('Share: ' + form.getPublishedUrl());
}
