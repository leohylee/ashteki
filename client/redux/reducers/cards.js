import { Decks } from '../types';

function selectDeck(state, deck) {
    if (state.decks && state.decks.length !== 0) {
        state.selectedDeck = deck;
    } else {
        delete state.selectedDeck;
    }

    return state;
}

function processDecks(decks, state) {
    for (let deck of decks) {
        if (!state.cards) {
            deck.status = {};

            continue;
        }

        deck.phoenixborn = deck.phoenixborn.map((card) => ({
            count: card.count,
            card: Object.assign({}, state.cards[card.id]),
            id: card.id,
            conjurations: card.conjurations
        }));
        let hasPhoenixborn = deck.phoenixborn.length === 1;

        deck.cards = deck.cards.map((card) => {
            const c = Object.assign({}, state.cards[card.id]);
            return {
                count: card.count,
                card: c,
                id: card.id,
                conjurations: c.conjurations,
                phoenixborn: c.phoenixborn,
                ff: card.ff
            };
        });

        // Process sideboard cards if they exist
        if (deck.sideboard && deck.sideboard.length > 0) {
            deck.sideboard = deck.sideboard.map((card) => {
                const c = Object.assign({}, state.cards[card.id]);
                return {
                    count: card.count,
                    card: c,
                    id: card.id,
                    phoenixborn: c.phoenixborn
                };
            });
        } else {
            deck.sideboard = [];
        }

        // Rebuild conjurations from phoenixborn, main deck, and sideboard cards
        const { mainConjurations, sideboardConjurations } = rebuildConjurations(deck, state.cards);
        deck.conjurations = mainConjurations;
        deck.sideboardConjurations = sideboardConjurations;

        let hasConjurations = checkConjurations(deck);
        let tenDice = 10 === deck.dicepool.reduce((acc, d) => acc + d.count, 0);

        const countUniques = deck.cards
            .filter((c) => c.card.phoenixborn)
            .reduce((agg, b) => agg + b.count, 0);
        const validUniques =
            // none for other pbs
            deck.cards.filter(
                (c) => c.card.phoenixborn && c.card.phoenixborn !== deck.phoenixborn[0].card.name
            ).length === 0 &&
            // max 3 uniques unless in onecollection format when all are allowed
            (countUniques <= 3 || deck.format === 'onecollection');
        let uniques = !hasPhoenixborn || validUniques;

        let cardCount = deck.cards.reduce((acc, card) => acc + card.count, 0);
        const legalToPlay =
            hasPhoenixborn && cardCount === 30 && hasConjurations && tenDice && uniques;
        const maxThree = !deck.cards.some((c) => c.count > 3);

        deck.status = {
            basicRules: hasPhoenixborn && cardCount === 30,
            maxThree: maxThree,
            legalToPlay: legalToPlay,
            hasConjurations: hasConjurations,
            uniques: uniques,
            tenDice: tenDice,
            noUnreleasedCards: true,
            officialRole: true
        };
    }
}

function checkConjurations(deck) {
    let cons = deck.cards
        .concat(deck.phoenixborn)
        .filter((c) => !!c.card.conjurations)
        .reduce((acc, c) => acc.concat(c.card.conjurations), [])
        .map((c) => c.stub);
    let result = cons.reduce((a, stub) => a && deck.conjurations.some((c) => c.id === stub), true);
    return result;
}

// Helper function to rebuild conjurations from phoenixborn, main deck, and sideboard cards
function rebuildConjurations(deck, allCards) {
    const mainConjurations = [];
    const sideboardConjurations = [];

    // Helper to recursively add conjurations
    function addConjurationRecursive(cardData, targetArray) {
        if (cardData && cardData.conjurations) {
            cardData.conjurations.forEach((conj) => {
                // Check if already added to either array
                if (!mainConjurations.some((c) => c.id === conj.stub) &&
                    !sideboardConjurations.some((c) => c.id === conj.stub)) {
                    const conjCard = allCards[conj.stub];
                    if (conjCard) {
                        targetArray.push({
                            count: conjCard.copies || 1,
                            card: Object.assign({}, conjCard),
                            id: conj.stub
                        });
                        // Recursively add conjurations for this conjuration
                        addConjurationRecursive(conjCard, targetArray);
                    }
                }
            });
        }
    }

    // Add conjurations from phoenixborn
    if (deck.phoenixborn && deck.phoenixborn.length > 0) {
        const pbCard = deck.phoenixborn[0].card || deck.phoenixborn[0];
        addConjurationRecursive(pbCard, mainConjurations);
    }

    // Add conjurations from cards in main deck
    deck.cards.forEach((deckCard) => {
        const cardData = deckCard.card || allCards[deckCard.id];
        addConjurationRecursive(cardData, mainConjurations);
    });

    // Add conjurations from cards in sideboard
    if (deck.sideboard && deck.sideboard.length > 0) {
        deck.sideboard.forEach((deckCard) => {
            const cardData = deckCard.card || allCards[deckCard.id];
            addConjurationRecursive(cardData, sideboardConjurations);
        });
    }

    return { mainConjurations, sideboardConjurations };
}

export default function (state = { decks: [], cards: {} }, action) {
    let newState;
    switch (action.type) {
        case 'RECEIVE_CARDS':
            var decks = state.decks;

            newState = Object.assign({}, state, {
                cards: action.response.cards
            });

            if (decks.length > 0) {
                processDecks(decks, newState);

                newState.decks = decks;
            }

            return newState;
        case 'RECEIVE_ALTS':
            newState = Object.assign({}, state, {
                alts: action.response.alts
            });

            return newState;
        case 'ZOOM_CARD':
            return Object.assign({}, state, {
                zoomCard: action.card
            });
        case 'CLEAR_ZOOM':
            return Object.assign({}, state, {
                zoomCard: undefined
            });
        case Decks.DecksReceived:
            processDecks(action.response.decks, state);
            newState = Object.assign({}, state, {
                singleDeck: false,
                numDecks: action.response.numDecks,
                decks: action.response.decks
            });

            newState = selectDeck(newState, newState.decks[0]);

            return newState;
        case 'STANDALONE_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                standaloneDecks: action.response.decks
            });

            return newState;
        case 'ADVENTURINGPARTY_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                adventuringPartyDecks: action.response.decks
            });

            return newState;
        case 'BUILDINGBASICS_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                buildingBasicsDecks: action.response.decks
            });

            return newState;
        case 'CORPSEREBUILD_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                corpseRebuildDecks: action.response.decks
            });

            return newState;
        case 'FIRSTADVENTURE_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                firstAdventureDecks: action.response.decks
            });

            return newState;
        case 'PVE_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                pveDecks: action.response.decks
            });

            return newState;
        case 'CHIMERA_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                chimeraDecks: action.response.decks
            });

            return newState;
        case 'MSU_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                msuDecks: action.response.decks
            });

            return newState;
        case 'DUALDUEL_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                dualDuelDecks: action.response.decks
            });

            return newState;
        case 'ONECOLLECTION_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                oneCollectionDecks: action.response.decks
            });

            return newState;
        case 'REQUEST_DECK':
            return Object.assign({}, state, {
                deckSaved: false,
                deckDeleted: false
            });
        case Decks.RequestDecks:
            newState = Object.assign({}, state, {
                deckSaved: false,
                deckDeleted: false
            });

            return newState;
        case 'RECEIVE_DECK':
            newState = Object.assign({}, state, {
                singleDeck: true,
                deckSaved: false
            });

            if (!newState.decks.some((deck) => deck._id === action.response.deck._id)) {
                newState.decks.push(processDecks([action.response.deck], state));
            }

            var selected = newState.decks.find((deck) => {
                return deck._id === action.response.deck._id;
            });

            newState = selectDeck(newState, selected);

            return newState;
        case 'SELECT_DECK':
            newState = Object.assign({}, state, {
                selectedDeck: action.deck,
                deckSaved: false
            });

            if (newState.selectedDeck) {
                processDecks([newState.selectedDeck], state);
            }

            return newState;
        case 'ADD_DECK':
            var aradel = state.cards['aradel-summergaard'];
            var newDeck = {
                name: 'New Deck',
                cards: [],
                conjurations: [],
                phoenixborn: [aradel],
                dicepool: []
            };

            newState = Object.assign({}, state, {
                selectedDeck: newDeck,
                deckSaved: false
            });

            processDecks([newState.selectedDeck], state);

            return newState;
        case 'ADD_DRAFT_DECK':
            // Get all Phoenixborn cards and randomly select one
            var allPhoenixborn = Object.values(state.cards).filter(
                (card) => card.type === 'Phoenixborn'
            );
            var randomPhoenixborn = allPhoenixborn[Math.floor(Math.random() * allPhoenixborn.length)];

            // Find all cards that belong to this Phoenixborn
            var phoenixbornCards = Object.values(state.cards).filter(
                (card) => card.phoenixborn === randomPhoenixborn.name &&
                         card.type !== 'Phoenixborn' &&
                         card.type !== 'Conjuration' &&
                         card.type !== 'Conjured Alteration Spell'
            ).map((card) => ({
                count: 1,
                card: Object.assign({}, card),
                id: card.stub,
                conjurations: card.conjurations,
                phoenixborn: card.phoenixborn
            }));

            var newDraftDeck = {
                name: 'New Draft Deck',
                cards: [],
                conjurations: [],
                phoenixborn: [randomPhoenixborn],
                dicepool: [],
                sideboard: phoenixbornCards,
                mode: 'draft'
            };

            newState = Object.assign({}, state, {
                selectedDeck: newDraftDeck,
                deckSaved: false
            });

            processDecks([newState.selectedDeck], state);

            return newState;
        case 'UPDATE_DECK':
            newState = Object.assign({}, state, {
                selectedDeck: action.deck,
                deckSaved: false
            });

            if (newState.selectedDeck) {
                processDecks([newState.selectedDeck], state);
            }

            return newState;
        case 'SWAP_DECK_CARD':
            if (!state.selectedDeck) {
                return state;
            }

            const deck = Object.assign({}, state.selectedDeck);
            const sideboardIndex = deck.sideboard.findIndex(c => c.id === action.sideboardCardId);
            const mainIndex = deck.cards.findIndex(c => c.id === action.mainCardId);

            if (sideboardIndex === -1 || mainIndex === -1) {
                return state;
            }

            // Swap the cards
            const tempCard = deck.sideboard[sideboardIndex];
            deck.sideboard[sideboardIndex] = deck.cards[mainIndex];
            deck.cards[mainIndex] = tempCard;

            // Rebuild conjurations based on current phoenixborn and main deck cards
            const { mainConjurations: swapMainConj, sideboardConjurations: swapSideboardConj } = rebuildConjurations(deck, state.cards);
            deck.conjurations = swapMainConj;
            deck.sideboardConjurations = swapSideboardConj;

            newState = Object.assign({}, state, {
                selectedDeck: deck,
                deckSaved: false
            });

            processDecks([newState.selectedDeck], state);

            return newState;
        case 'CHANGE_CARD_QUANTITY':
            if (!state.selectedDeck) {
                return state;
            }

            const quantityDeck = Object.assign({}, state.selectedDeck);

            // Clone the appropriate array (cards or sideboard)
            if (action.isSideboard) {
                quantityDeck.sideboard = [...quantityDeck.sideboard];
            } else {
                quantityDeck.cards = [...quantityDeck.cards];
            }

            const cardList = action.isSideboard ? quantityDeck.sideboard : quantityDeck.cards;
            const cardIndex = cardList.findIndex(c => c.id === action.cardId);

            if (cardIndex === -1) {
                return state;
            }

            // Clone the card object and update the quantity (ensure it's between 1 and 3)
            cardList[cardIndex] = Object.assign({}, cardList[cardIndex], {
                count: Math.max(1, Math.min(3, action.newQuantity))
            });

            newState = Object.assign({}, state, {
                selectedDeck: quantityDeck,
                deckSaved: false
            });

            processDecks([newState.selectedDeck], state);

            return newState;
        case 'DECK_DUPLICATED':
            decks = state.decks;
            decks.unshift(action.response.deck);
            newState = Object.assign({}, state, {
                selectedDeck: action.response.deck,
                deckSaved: true,
                decks: decks
            });

            processDecks(newState.decks, state);

            return newState;
        case 'SAVE_DECK':
            newState = Object.assign({}, state, {
                deckSaved: false
            });

            return newState;
        case 'DECK_SAVED':
            newState = Object.assign({}, state, {
                deckSaved: true,
                decks: []
            });

            return newState;

        case Decks.ImportDeck:
            newState = Object.assign({}, state, {
                deckSaved: false
            });

            return newState;
        case Decks.DeckImported:
            decks = state.decks;
            decks.unshift(action.response.deck);
            newState = Object.assign({}, state, {
                deckSaved: true,
                selectedDeck: action.response.deck,
                decks: decks
            });

            processDecks(newState.decks, state);

            return newState;

        case Decks.DeckResynced:
            newState = Object.assign({}, state, {
                deckReload: !state.deckReload
            });

            return newState;

        case 'DECK_DELETED':
            newState = Object.assign({}, state, {
                deckDeleted: true
            });

            newState.decks = newState.decks.filter((deck) => {
                return deck._id !== action.response.deckId;
            });

            newState.selectedDeck = newState.decks[0];

            return newState;
        case 'CLEAR_DECK_STATUS':
            return Object.assign({}, state, {
                deckDeleted: false,
                deckSaved: false
            });
        case 'DECK_FAVED':
            newState = Object.assign({}, state, {});

            var faved = newState.decks.find((deck) => {
                return deck._id === action.response.deckId;
            });

            faved.favourite = action.response.isFave;

            return newState;

        default:
            return state;
    }
}
