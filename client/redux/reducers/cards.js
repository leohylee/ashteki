import { Decks } from '../types';

function selectDeck(state, deck) {
    // if (state.decks && state.decks.length !== 0) {
    state.selectedDeck = deck;
    // } else {
    //     delete state.selectedDeck;
    // }

    return state;
}

function processDecks(decks, state) {
    for (let deck of decks) {
        if (!state.cards || Object.values(state.cards).length === 0) {
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

        deck.behaviour = deck.behaviour?.map((card) => ({
            count: card.count,
            card: Object.assign({}, state.cards[card.id]),
            id: card.id,
            conjurations: card.conjurations
        }));

        deck.ultimate = deck.ultimate?.map((card) => ({
            count: card.count,
            card: Object.assign({}, state.cards[card.id]),
            id: card.id,
            conjurations: card.conjurations
        }));

        deck.cards = deck.cards.map((card) => {
            const c = Object.assign({}, state.cards[card.id]);
            return {
                count: card.count,
                card: c,
                id: card.id,
                conjurations: c.conjurations,
                phoenixborn: c.phoenixborn,
                ff: card.ff,
                imageStub: card.imageStub,
                blood: card.blood
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
        const legalCardCount = deck.mode === 'chimera' ? 18 : 30;
        const numDice = deck.mode === 'chimera' ? 5 : 10;
        let expectedDice = numDice === deck.dicepool.reduce((acc, d) => acc + d.count, 0);

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
        const maxThree = !deck.cards.some((c) => c.count > 3);
        let aspectCheck = true;
        if (deck.mode === 'chimera') {
            const oneCount = deck.cards.filter(c => c.card.blood === 1).reduce((acc, c) => acc + c.count, 0);
            const twoCount = deck.cards.filter(c => c.card.blood === 2).reduce((acc, c) => acc + c.count, 0);
            aspectCheck = oneCount === 9 && twoCount === 9;
        }
        const legalToPlay =
            hasPhoenixborn &&
            cardCount === legalCardCount &&
            hasConjurations &&
            maxThree &&
            aspectCheck &&
            expectedDice &&
            uniques;

        deck.status = {
            basicRules: hasPhoenixborn && cardCount === legalCardCount,
            maxThree: maxThree,
            legalToPlay: legalToPlay,
            hasConjurations: hasConjurations,
            uniques: uniques,
            tenDice: expectedDice,
            aspectCheck: aspectCheck
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

export default function (state = { decks: [], myChimeraDecks: [], cards: {} }, action) {
    let newState;
    switch (action.type) {
        case 'RECEIVE_CARDS':
            newState = Object.assign({}, state, {
                cards: action.response.cards
            });

            var decks = state.decks;
            if (decks.length > 0) {
                processDecks(decks, newState);
                newState.decks = decks;
            }

            var myChimeraDecks = state.myChimeraDecks;
            if (myChimeraDecks.length > 0) {
                processDecks(myChimeraDecks, newState);
                newState.myChimeraDecks = myChimeraDecks;
            }

            var precons = state.standaloneDecks;
            if (precons?.length > 0) {
                processDecks(precons, newState);
                newState.standaloneDecks = precons;
            }

            var adventuringPartyDecks = state.adventuringPartyDecks;
            if (adventuringPartyDecks?.length > 0) {
                processDecks(adventuringPartyDecks, newState);
                newState.adventuringPartyDecks = adventuringPartyDecks;
            }

            var firstAdventureDecks = state.firstAdventureDecks;
            if (firstAdventureDecks?.length > 0) {
                processDecks(firstAdventureDecks, newState);
                newState.firstAdventureDecks = firstAdventureDecks;
            }
            var pveDecks = state.pveDecks;
            if (pveDecks?.length > 0) {
                processDecks(pveDecks, newState);
                newState.pveDecks = pveDecks;
            }
            var chimeraDecks = state.chimeraDecks;
            if (chimeraDecks?.length > 0) {
                processDecks(chimeraDecks, newState);
                newState.chimeraDecks = chimeraDecks;
            }
            var dualDuelDecks = state.dualDuelDecks;
            if (dualDuelDecks?.length > 0) {
                processDecks(dualDuelDecks, newState);
                newState.dualDuelDecks = dualDuelDecks;
            }
            var oneCollectionDecks = state.oneCollectionDecks;
            if (oneCollectionDecks?.length > 0) {
                processDecks(oneCollectionDecks, newState);
                newState.oneCollectionDecks = oneCollectionDecks;
            }
            var ascendancyDecks = state.ascendancyDecks;
            if (ascendancyDecks?.length > 0) {
                processDecks(ascendancyDecks, newState);
                newState.ascendancyDecks = ascendancyDecks;
            }
            var dragonbornDecks = state.dragonbornDecks;
            if (dragonbornDecks?.length > 0) {
                processDecks(dragonbornDecks, newState);
                newState.dragonbornDecks = dragonbornDecks;
            }

            return newState;
        case 'RECEIVE_ALTS':
            newState = Object.assign({}, state, {
                alts: action.response.alts
            });

            return newState;
        case 'ZOOM_CARD':
            return Object.assign({}, state, {
                zoomCard: action.card,
                zoomSticky: !!action.options?.sticky
            });
        case 'CLEAR_ZOOM':
            return Object.assign({}, state, {
                zoomCard: undefined,
                zoomSticky: false
            });
        case Decks.DecksReceived:
            console.log('decks received');
            processDecks(action.response.decks, state);
            console.log('decks processed');

            newState = Object.assign({}, state, {
                singleDeck: false,
                numDecks: action.response.numDecks,
                decks: action.response.decks
            });

            newState = selectDeck(newState, newState.decks[0]);

            return newState;

        case 'CHIMERA_DECKS_RECEIVED':
            processDecks(action.response.decks, state);
            newState = Object.assign({}, state, {
                singleDeck: false,
                numDecks: action.response.numDecks,
                myChimeraDecks: action.response.decks
            });

            newState = selectDeck(newState, newState.myChimeraDecks[0]);

            return newState;
        case 'STANDALONE_DECKS_LOADED':
            if (action.response.decks) {
                console.log('standalone decks received');

                processDecks(action.response.decks, state);
                console.log('standalone decks processed');

            }

            newState = Object.assign({}, state, {
                standaloneDecks: action.response.decks
            });

            return newState;
        case 'PRECON_DECKS_LOADED':
            if (action.response.decks) {
                console.log('precon decks received');

                processDecks(action.response.decks, state);
                console.log('precon decks processed');
            }
            var groupedDecks = action.response.decks.groupBy(d => d.groupName);

            newState = Object.assign({}, state, {
                standaloneDecks: groupedDecks.reborn || [],
                adventuringPartyDecks: groupedDecks.aparty || [],
                firstAdventureDecks: groupedDecks.firstadventure || [],
                pveDecks: groupedDecks.pve || [],
                chimeraDecks: groupedDecks.chimera || [],
                dualDuelDecks: groupedDecks.dualduel || [],
                oneCollectionDecks: groupedDecks.onecollection || [],
                ascendancyDecks: groupedDecks.ascendancy || [],
                dragonbornDecks: groupedDecks.dragonborn || []
            });

            return newState;
        case 'ADVENTURINGPARTY_DECKS_LOADED':
            if (action.response.decks) {
                console.log('aparty decks received');

                processDecks(action.response.decks, state);
                console.log('aparty decks processed');
            }

            newState = Object.assign({}, state, {
                adventuringPartyDecks: action.response.decks
            });

            return newState;
        case 'FIRSTADVENTURE_DECKS_LOADED':
            if (action.response.decks) {
                console.log('firstadventure decks received');

                processDecks(action.response.decks, state);
                console.log('firstadventure decks processed');

            }

            newState = Object.assign({}, state, {
                firstAdventureDecks: action.response.decks
            });

            return newState;
        case 'PVE_DECKS_LOADED':
            if (action.response.decks) {
                console.log('pve decks received');

                processDecks(action.response.decks, state);
                console.log('pve decks processed');

            }

            newState = Object.assign({}, state, {
                pveDecks: action.response.decks
            });

            return newState;
        case 'CHIMERA_DECKS_LOADED':
            if (action.response.decks) {
                console.log('chimera decks received');

                processDecks(action.response.decks, state);
                console.log('chimera decks processed');

            }

            newState = Object.assign({}, state, {
                chimeraDecks: action.response.decks
            });

            return newState;
        case 'DUALDUEL_DECKS_LOADED':
            if (action.response.decks) {
                console.log('dualduel decks received');

                processDecks(action.response.decks, state);
                console.log('dualduel decks processed');

            }

            newState = Object.assign({}, state, {
                dualDuelDecks: action.response.decks
            });

            return newState;
        case 'ONECOLLECTION_DECKS_LOADED':
            if (action.response.decks) {
                console.log('OCB decks received');

                processDecks(action.response.decks, state);
                console.log('OCB decks processed');

            }

            newState = Object.assign({}, state, {
                oneCollectionDecks: action.response.decks
            });

            return newState;
        case 'ASCENDANCY_DECKS_LOADED':
            if (action.response.decks) {
                processDecks(action.response.decks, state);
            }

            newState = Object.assign({}, state, {
                ascendancyDecks: action.response.decks
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
        case 'REQUEST_CHIMERA_DECKS':
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

            var defaultNotes = `Progress: Standard 1
Attempts: 3/3

Chimera:
The Corpse of Viros (Fury)
The Corpse of Viros (Shadow)
The Frostwild Scourge (Storm)
The Frostwild Scourge (Mighty)
The Blight of Neverset (Bloom)
The Blight of Neverset (Thorn)
The Siege of Lordswall (Horde)
The Siege of Lordswall (Death)
The Spawn of Shadowreck (Lair)
The Spawn of Shadowreck (Horror)`;

            var newDraftDeck = {
                name: 'New Draft Deck',
                cards: [],
                conjurations: [],
                phoenixborn: [randomPhoenixborn],
                dicepool: [],
                sideboard: phoenixbornCards,
                mode: 'draft',
                notes: defaultNotes
            };

            newState = Object.assign({}, state, {
                selectedDeck: newDraftDeck,
                deckSaved: false
            });

            processDecks([newState.selectedDeck], state);

            return newState;
        case 'ADD_CHIMERA_DECK':
            var corpse = state.cards['corpse-of-viros'];
            var newChimeraDeck = {
                name: 'New Deck',
                cards: [],
                conjurations: [],
                phoenixborn: [corpse],
                dicepool: [{ magic: 'rage', count: 5 }],
                mode: 'chimera'
            };

            newState = Object.assign({}, state, {
                selectedDeck: newChimeraDeck,
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
        case 'SET_CARD_FIRST_FIVE':
            newState = Object.assign({}, state, {
                selectedDeck: action.deck,
                deckSaved: false
            });

            var card = newState.selectedDeck.cards.find(c => c.id === action.card.id);
            card.ff = !card.ff;

            if (newState.selectedDeck) {
                processDecks([newState.selectedDeck], state);
            }

            return newState;
        case 'DECK_DUPLICATED':
            var isChimera = action.response.deck.mode === 'chimera';
            if (isChimera) {
                var myChimDecks = state.myChimeraDecks;
                myChimDecks.unshift(action.response.deck);
                newState = Object.assign({}, state, {
                    selectedDeck: action.response.deck,
                    deckSaved: true,
                    myChimeraDecks: myChimDecks
                });
                processDecks(newState.myChimeraDecks, state);
            } else {
                var myDecks = [action.response.deck, ...state.decks];
                newState = Object.assign({}, state, {
                    selectedDeck: action.response.deck,
                    deckSaved: true,
                    decks: myDecks
                });
                processDecks(newState.decks, state);
            }

            return newState;
        case 'SAVE_DECK':
            newState = Object.assign({}, state, {
                deckSaved: false
            });

            return newState;
        case 'DECK_SAVED':
            newState = Object.assign({}, state, {
                deckSaved: true,
                decks: [],
                myChimeraDecks: []
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

            var chimeraDeleted = !!state.myChimeraDecks.find(d => d._id === action.response.deckId);
            newState.decks = newState.decks.filter((deck) => {
                return deck._id !== action.response.deckId;
            });
            newState.myChimeraDecks = newState.myChimeraDecks.filter((deck) => {
                return deck._id !== action.response.deckId;
            });

            if (chimeraDeleted) {
                newState.selectedDeck = newState.myChimeraDecks[0];
            } else {
                newState.selectedDeck = newState.decks[0];
            }

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
