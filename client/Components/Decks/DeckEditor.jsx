import React, { useState, useEffect, useRef } from 'react';
import _ from 'underscore';
import $ from 'jquery';
import { useSelector, useDispatch } from 'react-redux';
import { Form, Col, Row, Button, Modal } from 'react-bootstrap';
import { Typeahead } from 'react-bootstrap-typeahead';
import TextArea from '../Form/TextArea.jsx';
import DraftCardPicker from './DraftCardPicker.jsx';
import { updateDeck } from '../../redux/actions';
import { useNavigate } from 'react-router-dom';
import './DeckEditor.scss';

function DeckEditor({ deck, onDeckSave, isChimera, mode }) {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const typeaheadRef = useRef(null);
    // Tracks the last deck object we dispatched ourselves so the external-sync
    // effect can tell our own updates apart from external ones (e.g. sideboard swaps).
    const selfUpdateRef = useRef(null);

    const cards = useSelector((state) => state.cards.cards);
    // const deck = useSelector((state) => state.cards.selectedDeck);
    const loading = useSelector((state) => state.api.loading);
    const user = useSelector((state) => state.account.user);
    const checkRestriction = (card) => {
        return !card.restricted || user.permissions?.playtester;
    };

    const [cardList, setCardList] = useState('');
    const [diceList, setDiceList] = useState('');
    const [sideboardList, setSideboardList] = useState('');
    const [deckState, setDeckState] = useState(copyDeck(deck));
    const [numberToAdd, setNumberToAdd] = useState(1);
    const [cardToAdd, setCardToAdd] = useState(null);
    const [pbid, setPbid] = useState('');
    const [sideboardReadonly, setSideboardReadonly] = useState(true);
    const [showConfirmationModal, setShowConfirmationModal] = useState(false);
    // Draft mode state grouped together
    const [draftState, setDraftState] = useState({
        showDraftPicker: false,
        showSideboardPicker: false,
        draftCardOptions: [],
        refreshesRemaining: 3,
        lockedCardIndices: [],
        sideboardPicksRemaining: 3,
        pickedCardStubs: []
    });

    function updateDraftState(updates) {
        setDraftState((prev) => ({ ...prev, ...updates }));
    }

    // Dispatch a deck update to redux and remember the reference so the external-sync
    // effect won't clobber the editor's textareas in response to our own change.
    function dispatchDeck(d) {
        selfUpdateRef.current = d;
        dispatch(updateDeck(d));
    }

    function copyDeck(deckToCopy) {
        if (!deckToCopy) {
            return {
                name: 'New Deck',
                phoenixborn: [],
                cards: [],
                conjurations: [],
                notes: '',
                dicepool: [],
                sideboard: []
            };
        }

        return {
            _id: deckToCopy._id,
            name: deckToCopy.name,
            phoenixborn: deckToCopy.phoenixborn,
            ultimate: deckToCopy.ultimate,
            behaviour: deckToCopy.behaviour,
            cards: deckToCopy.cards,
            conjurations: deckToCopy.conjurations,
            status: deckToCopy.status,
            notes: deckToCopy.notes,
            dicepool: deckToCopy.dicepool,
            mode: deckToCopy.mode,
            sideboard: deckToCopy.sideboard || [],
            sideboardConjurations: deckToCopy.sideboardConjurations || []
        };
    }

    function getCardListEntry(count, card, ff) {
        const fFive = ff ? ' ff' : '';
        return count + ' ' + card.name + fFive + '\n';
    }

    function getDiceListEntry(diceCount) {
        return diceCount.count + ' ' + diceCount.magic + '\n';
    }

    function addConjurations(card, deckToUpdate) {
        if (card.conjurations) {
            card.conjurations.forEach((conj) => {
                if (!deckToUpdate.conjurations.some((c) => c.id === conj.stub)) {
                    var c = getCard(conj.name);
                    if (c) {
                        addCard(c, c.copies, deckToUpdate);
                    }
                }
            });
        }
    }

    function rebuildConjurations(deckToUpdate) {
        deckToUpdate.conjurations = [];

        addConjurations(deckToUpdate.phoenixborn[0], deckToUpdate);
        deckToUpdate.cards.forEach((c) => addConjurations(c, deckToUpdate));
    }

    function rebuildBehaviourAndUltimate(deckToUpdate) {
        deckToUpdate.behaviour = [];
        deckToUpdate.ultimate = [];

        addBehaviour(deckToUpdate.phoenixborn[0], deckToUpdate);
        addUltimate(deckToUpdate.phoenixborn[0], deckToUpdate);
    }

    function addBehaviour(card, deckToUpdate) {
        if (card.behaviourCard) {
            var c = getCard(card.behaviourCard);
            if (c) {
                addCard(c, c.copies, deckToUpdate);
            }
        }
    }

    function addUltimate(card, deckToUpdate) {
        if (card.ultimateCard) {
            var c = getCard(card.ultimateCard);
            if (c) {
                addCard(c, c.copies, deckToUpdate);
            }
        }
    }

    function addCard(card, number, deckToUpdate, isFirstFive) {
        let phoenixborn = deckToUpdate.phoenixborn;
        let conjurations = deckToUpdate.conjurations;
        let cardsList = deckToUpdate.cards;
        let behaviours = deckToUpdate.behaviour;
        let ultimates = deckToUpdate.ultimate;

        let list;

        if (['Conjuration', 'Conjured Alteration Spell', 'Conjured Aspect'].includes(card.type)) {
            list = conjurations;
        } else if (['Phoenixborn', 'Chimera'].includes(card.type)) {
            list = phoenixborn;
        } else if (card.type === 'Behaviour') {
            list = behaviours;
        } else if (card.stub.includes('ultimate')) {
            list = ultimates;
        } else {
            list = cardsList;
        }

        const entry = list.find((c) => c.id === card.stub);
        if (entry) {
            entry.count += number;
        } else {
            list.push({
                count: number,
                card: card,
                id: card.stub,
                conjurations: card.conjurations,
                ff: isFirstFive
            });
        }
        addConjurations(card, deckToUpdate);
    }

    function parseMagic(input) {
        let mgc = '';
        switch (input) {
            case 'artifice':
            case 'art':
                mgc = 'artifice';
                break;
            case 'astral':
            case 'ast':
                mgc = 'astral';
                break;
            case 'nature':
            case 'nat':
            case 'natural':
                mgc = 'natural';
                break;
            case 'cha':
            case 'charm':
                mgc = 'charm';
                break;
            case 'ill':
            case 'illusion':
                mgc = 'illusion';
                break;
            case 'cer':
            case 'ceremonial':
                mgc = 'ceremonial';
                break;
            case 'div':
            case 'divine':
                mgc = 'divine';
                break;
            case 'sym':
            case 'sympathy':
                mgc = 'sympathy';
                break;
            case 'tim':
            case 'time':
                mgc = 'time';
                break;
            case 'rage':
                mgc = 'rage';
                break;
        }
        let validMagics = [
            'artifice',
            'astral',
            'charm',
            'ceremonial',
            'illusion',
            'natural',
            'divine',
            'sympathy',
            'time'
        ];
        if (isChimera) {
            validMagics.push('rage');
        }
        let isValid = validMagics.includes(mgc);
        return isValid ? mgc : '';
    }

    useEffect(() => {
        let newCardList = '';
        if (deck && (deck.cards || deck.conjurations)) {
            const newPbid = deck.phoenixborn.length > 0 ? deck.phoenixborn[0].id : '';
            setPbid(newPbid);

            _.each(deck.cards, (card) => {
                newCardList += getCardListEntry(card.count, card.card, card.ff);
            });

            setCardList(newCardList);
        }

        let newDiceList = '';
        if (deck && deck.dicepool) {
            _.each(deck.dicepool, (diceCount) => {
                newDiceList += getDiceListEntry(diceCount);
            });

            setDiceList(newDiceList);
        }

        let newSideboardList = '';
        if (deck && deck.sideboard) {
            _.each(deck.sideboard, (card) => {
                newSideboardList += getCardListEntry(card.count, card.card);
            });

            setSideboardList(newSideboardList);
        }

        setDeckState(copyDeck(deck));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Resync the editor's text when the deck changes from an external source (e.g. a
    // sideboard swap made from the preview pane), but not in response to our own edits.
    useEffect(() => {
        if (!deck || deck === selfUpdateRef.current) {
            return;
        }

        let newCardList = '';
        _.each(deck.cards, (card) => {
            newCardList += getCardListEntry(card.count, card.card, card.ff);
        });
        setCardList(newCardList);

        // Don't clobber the sideboard textarea while the user is actively editing it.
        const sideboardBeingEdited = deck.mode === 'draft' && !sideboardReadonly;
        if (!sideboardBeingEdited) {
            let newSideboardList = '';
            _.each(deck.sideboard, (card) => {
                newSideboardList += getCardListEntry(card.count, card.card);
            });
            setSideboardList(newSideboardList);
        }

        setDeckState(copyDeck(deck));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deck]);

    function handleCancelClick() {
        if (isChimera) {
            navigate('/decks/chimera');
        } else {
            navigate('/decks');
        }
    }

    function onChange(field, event) {
        let newDeck = copyDeck(deckState);
        newDeck[field] = event.target.value;
        setDeckState(newDeck);
        dispatchDeck(newDeck);
    }

    function onPbChange(event) {
        let newDeck = copyDeck(deckState);
        let pb = cards[event.target.value];

        if (newDeck.phoenixborn.length == 0) {
            newDeck.phoenixborn.push(pb);
        } else newDeck.phoenixborn[0] = pb;
        setPbid(pb.id);

        if (pb.type === 'Chimera') {
            rebuildBehaviourAndUltimate(newDeck);
        }
        rebuildConjurations(newDeck);
        setDeckState(newDeck);
        dispatchDeck(newDeck);
    }

    function onNumberToAddChange(event) {
        setNumberToAdd(event.target.value);
    }

    function addCardChange(selectedCards) {
        setCardToAdd(selectedCards[0]);
    }

    function onAddCard(event) {
        event.preventDefault();

        if (!cardToAdd || !cardToAdd.name || cardToAdd.type == 'Phoenixborn') {
            return;
        }

        let newDeck = deckState;
        addCard(cardToAdd, parseInt(numberToAdd), newDeck);

        let newCardList = cardList;
        newCardList += getCardListEntry(numberToAdd, cardToAdd);
        setCardList(newCardList);

        typeaheadRef.current.clear();

        newDeck = copyDeck(newDeck);
        setDeckState(newDeck);
        dispatchDeck(newDeck);
    }

    function onCardListChange(event) {
        event.preventDefault();

        let newDeck = deckState;
        let split = event.target.value.split('\n');

        newDeck.cards = [];
        newDeck.conjurations = [];

        _.each(split, (line) => {
            line = line.trim();

            if (!$.isNumeric(line[0])) {
                return;
            }

            let index = 0;
            while (!isNaN(line[index]) || line[index] === 'x') {
                index++;
            }
            let num = parseInt(line.substr(0, index));
            let cardName = line.substr(index, line.length).trim();
            let isFirstFive = false;
            if (cardName.endsWith(' ff')) {
                isFirstFive = true;
                cardName = cardName.substr(0, cardName.length - 3);
            }

            let cardToAddFromList = getCard(cardName);

            if (cardToAddFromList) {
                const isConjuration =
                    cardToAddFromList.type === 'Conjuration' ||
                    cardToAddFromList.type === 'Conjured Alteration Spell';
                if (!isConjuration) {
                    addCard(cardToAddFromList, num, newDeck, isFirstFive);
                }
            }
        });

        addConjurations(newDeck.phoenixborn[0].card, newDeck);
        newDeck = copyDeck(newDeck);

        setCardList(event.target.value);
        setDeckState(newDeck);
        dispatchDeck(newDeck);
    }

    function onSideboardListChange(event) {
        event.preventDefault();

        let newDeck = deckState;
        let split = event.target.value.split('\n');

        newDeck.sideboard = [];

        _.each(split, (line) => {
            line = line.trim();

            if (!$.isNumeric(line[0])) {
                return;
            }

            let index = 0;
            while (!isNaN(line[index]) || line[index] === 'x') {
                index++;
            }
            let num = parseInt(line.substr(0, index));
            let cardName = line.substr(index, line.length).trim();

            let card = getCard(cardName);

            if (card) {
                newDeck.sideboard.push({
                    count: num,
                    card: card,
                    id: card.stub
                });
            }
        });

        // Rebuild conjurations from phoenixborn and main deck
        newDeck.conjurations = [];
        if (newDeck.phoenixborn && newDeck.phoenixborn.length > 0) {
            addConjurations(newDeck.phoenixborn[0].card || newDeck.phoenixborn[0], newDeck);
        }
        if (newDeck.cards) {
            newDeck.cards.forEach((c) => addConjurations(c.card, newDeck));
        }

        // Build sideboard conjurations separately
        const tempDeckForSideboard = { conjurations: [] };
        newDeck.sideboard.forEach((c) => addConjurations(c.card, tempDeckForSideboard));
        newDeck.sideboardConjurations = tempDeckForSideboard.conjurations;

        newDeck = copyDeck(newDeck);

        setSideboardList(event.target.value);
        setDeckState(newDeck);
        dispatchDeck(newDeck);
    }

    function getCard(searchText) {
        const exactMatch = getAllCards().find((card) =>
            card.stub === searchText ||
            card.name.toLowerCase() === searchText.toLowerCase()
        );

        if (exactMatch) {
            return exactMatch;
        }
        const matches = getAllCards().filter((card) =>
            card.name.toLowerCase().includes(searchText.toLowerCase())
        );

        if (matches.length === 1) {
            return matches[0];
        }
        return null;
    }

    function getAllCards(includeConjurations = false) {
        return _.toArray(cards).filter(
            (card) =>
                (checkRestriction(card)) &&
                ((isChimera && card.deckType === 'chimera') ||
                    (!isChimera && card.deckType !== 'chimera')) &&
                (includeConjurations || card.type !== 'conjuration')
        );
    }

    function onDiceListChange(event) {
        event.preventDefault();
        if (isChimera) {
            return;
        }
        let newDeck = deckState;
        let split = event.target.value.split('\n');

        newDeck.dicepool = [];

        _.each(split, (line) => {
            line = line.trim();

            if (!$.isNumeric(line[0])) {
                return;
            }

            let index = 0;
            while (!isNaN(line[index]) || line[index] === 'x') {
                index++;
            }
            let num = parseInt(line.substr(0, index));
            let magic = parseMagic(line.substr(index, line.length).toLowerCase());
            if (magic == '') return;
            newDeck.dicepool.push({ magic: magic.toLowerCase(), count: num });
        });

        newDeck = copyDeck(newDeck);

        setDiceList(event.target.value);
        setDeckState(newDeck);
        dispatchDeck(newDeck);
    }

    function onSaveClick(event) {
        event.preventDefault();

        if (onDeckSave) {
            onDeckSave(deck);
        }
    }

    // ----- Draft mode helpers -----

    // Helper to check if a card should be excluded from draft picks
    function shouldExcludeCardFromDraft(card) {
        // Exclude Phoenixborn, Conjurations, and Conjured Alteration Spells
        if (card.type === 'Phoenixborn' ||
            card.type === 'Conjuration' ||
            card.type === 'Conjured Alteration Spell') {
            return true;
        }

        // Exclude Phoenixborn-specific cards
        if (card.phoenixborn) {
            return true;
        }

        return false;
    }

    function getRandomCards(count = 4) {
        const availableCards = getAllCards().filter((card) => {
            if (shouldExcludeCardFromDraft(card)) {
                return false;
            }

            // Exclude cards that have already been picked in this draft
            if (draftState.pickedCardStubs.includes(card.stub)) {
                return false;
            }

            return true;
        });

        // Shuffle and pick random cards
        const shuffled = _.shuffle(availableCards);
        return shuffled.slice(0, count);
    }

    function getRandomSideboardCards(count = 4) {
        // For sideboard in edit mode, allow any cards except ones already in play
        const availableCards = getAllCards().filter((card) => {
            if (shouldExcludeCardFromDraft(card)) {
                return false;
            }

            // Exclude cards that are already in the deck or sideboard
            const isInDeck = deckState.cards?.some((c) => c.id === card.stub);
            const isInSideboard = deckState.sideboard?.some((c) => c.id === card.stub);
            if (isInDeck || isInSideboard) {
                return false;
            }

            return true;
        });

        // Shuffle and pick random cards
        const shuffled = _.shuffle(availableCards);
        return shuffled.slice(0, count);
    }

    function onOpenDraftPicker() {
        // Only generate new cards if we don't have any current options
        const randomCards = draftState.draftCardOptions.length > 0
            ? draftState.draftCardOptions
            : getRandomCards(4);

        updateDraftState({
            showDraftPicker: true,
            draftCardOptions: randomCards
        });
    }

    function onOpenSideboardPicker() {
        // Show confirmation modal first
        setShowConfirmationModal(true);
    }

    function onConfirmStageCompletion() {
        // User confirmed they completed the stage
        setShowConfirmationModal(false);

        // For edit mode (mode !== 'AddDraft'), use getRandomSideboardCards and give 5 refreshes.
        // For add draft mode, use getRandomCards and give 3 refreshes.
        // In both modes, reuse existing cards if they exist.
        if (mode === 'AddDraft') {
            const randomCards = draftState.draftCardOptions.length > 0
                ? draftState.draftCardOptions
                : getRandomCards(4);
            updateDraftState({
                showSideboardPicker: true,
                draftCardOptions: randomCards,
                refreshesRemaining: 3
            });
        } else {
            // Edit mode: reuse existing cards or generate new cards and give 5 refreshes
            const randomCards = draftState.draftCardOptions.length > 0
                ? draftState.draftCardOptions
                : getRandomSideboardCards(4);

            // Only reset refresh count if generating new cards
            const refreshCount = draftState.draftCardOptions.length > 0
                ? draftState.refreshesRemaining
                : 5;

            updateDraftState({
                showSideboardPicker: true,
                draftCardOptions: randomCards,
                refreshesRemaining: refreshCount
            });
        }
    }

    function onCancelStageCompletion() {
        // User cancelled - just close the modal
        setShowConfirmationModal(false);
    }

    function onRefreshSideboardCards() {
        // Generate new random cards while keeping locked cards.
        // Works for both AddDraft mode and edit mode.
        const currentCards = draftState.draftCardOptions;
        const lockedIndices = draftState.lockedCardIndices;

        // Use appropriate method based on mode
        const newRandomCards = mode === 'AddDraft'
            ? getRandomCards(4)
            : getRandomSideboardCards(4);

        // Replace non-locked cards with new random cards
        const refreshedCards = currentCards.map((card, index) => {
            if (lockedIndices.includes(index)) {
                return card; // Keep locked card
            } else {
                // Replace with a new random card
                return newRandomCards.shift() || card;
            }
        });

        updateDraftState({
            draftCardOptions: refreshedCards,
            refreshesRemaining: draftState.refreshesRemaining - 1
        });
    }

    function onDraftCardSelected(selectedCard, quantity) {
        // Add the selected card to the deck with the specified quantity
        let newDeck = deckState;
        addCard(selectedCard, quantity, newDeck);

        // Update the card list text
        let newCardList = cardList;
        newCardList += getCardListEntry(quantity, selectedCard);

        newDeck = copyDeck(newDeck);

        // Track this card as picked and clear the draft options after selection.
        // Reset refresh counter and locked cards.
        setCardList(newCardList);
        updateDraftState({
            showDraftPicker: false,
            draftCardOptions: [],
            refreshesRemaining: 3,
            lockedCardIndices: [],
            pickedCardStubs: [...draftState.pickedCardStubs, selectedCard.stub]
        });
        setDeckState(newDeck);

        dispatchDeck(newDeck);
    }

    function onDraftSideboardCardSelected(selectedCard, quantity) {
        // Add the card to the sideboard array
        let newDeck = deckState;

        if (!newDeck.sideboard) {
            newDeck.sideboard = [];
        }

        // Add card to sideboard
        newDeck.sideboard.push({
            count: quantity,
            card: selectedCard,
            id: selectedCard.stub
        });

        // Update the sideboard list text
        let newSideboardList = sideboardList;
        newSideboardList += getCardListEntry(quantity, selectedCard);

        newDeck = copyDeck(newDeck);

        setSideboardList(newSideboardList);
        setDeckState(newDeck);

        if (mode === 'AddDraft') {
            // AddDraft mode: Clear options after selection
            updateDraftState({
                showSideboardPicker: false,
                draftCardOptions: [],
                refreshesRemaining: 3,
                lockedCardIndices: [],
                sideboardPicksRemaining: draftState.sideboardPicksRemaining - 1,
                pickedCardStubs: [...draftState.pickedCardStubs, selectedCard.stub]
            });
        } else {
            // Edit mode: Just close the modal and keep card options
            updateDraftState({
                showSideboardPicker: false
            });
        }

        dispatchDeck(newDeck);
    }

    function onRefreshDraftCards() {
        if (draftState.refreshesRemaining > 0) {
            const currentCards = draftState.draftCardOptions;
            const lockedIndices = draftState.lockedCardIndices;

            // Generate new cards for unlocked positions
            const newRandomCards = getRandomCards(4 - lockedIndices.length);
            const newCards = [];
            let randomIndex = 0;

            for (let i = 0; i < 4; i++) {
                if (lockedIndices.includes(i)) {
                    // Keep locked card
                    newCards.push(currentCards[i]);
                } else {
                    // Replace with new random card
                    newCards.push(newRandomCards[randomIndex]);
                    randomIndex++;
                }
            }

            updateDraftState({
                draftCardOptions: newCards,
                refreshesRemaining: draftState.refreshesRemaining - 1
            });
        }
    }

    function onToggleLockCard(index) {
        const lockedIndices = [...draftState.lockedCardIndices];
        const indexPos = lockedIndices.indexOf(index);

        if (indexPos > -1) {
            // Unlock card
            updateDraftState({ lockedCardIndices: [] });
        } else {
            // Lock card (only one card can be locked at a time)
            updateDraftState({ lockedCardIndices: [index] });
        }
    }

    function onCloseDraftPicker() {
        // Keep the draftCardOptions when closing without selecting
        updateDraftState({ showDraftPicker: false });
    }

    function onCloseSideboardPicker() {
        // Keep the draftCardOptions when closing without selecting
        updateDraftState({ showSideboardPicker: false });
    }

    function toggleSideboardReadonly() {
        setSideboardReadonly((prev) => !prev);
    }

    if (!deck || loading) {
        return <div>Waiting for deck...</div>;
    }

    const isDraftDeck = deckState.mode === 'draft';

    let phoenixbornCards = getAllCards().filter(
        (c) => (isChimera && c.type === 'Chimera') || (!isChimera && c.type == 'Phoenixborn')
    );
    phoenixbornCards.sort((a, b) => (a.name < b.name ? -1 : 1));
    const conjurationTypes = ['Conjuration', 'Conjured Alteration Spell', 'Conjured Aspect'];
    const lookupCards = getAllCards().filter(
        (c) =>
            !conjurationTypes.includes(c.type) &&
            ((isChimera &&
                c.deckType === 'chimera' &&
                !c.name.includes('Ultimate') &&
                !c.name.includes('Behaviour') &&
                c.type !== 'Chimera') ||
                (!isChimera && c.deckType !== 'chimera'))
    );

    return (
        <div className='deck-editor'>
            <Form>
                <Form.Group as={Row} controlId='deckName'>
                    <Form.Label column sm='3'>
                        Deck Name
                    </Form.Label>
                    <Col>
                        <Form.Control
                            as='input'
                            defaultValue={deckState.name}
                            onChange={(e) => onChange('name', e)}
                        />
                    </Col>
                </Form.Group>
                <Form.Group as={Row} controlId='phoenixborn'>
                    <Form.Label column sm='3'>
                        Phoenixborn
                    </Form.Label>
                    <Col>
                        <Form.Control
                            as='select'
                            onChange={onPbChange}
                            value={pbid}
                            disabled={mode === 'AddDraft'}
                        >
                            {phoenixbornCards.map((c, index) => {
                                return (
                                    <option key={index} value={c.stub}>
                                        {c.name}
                                    </option>
                                );
                            })}
                        </Form.Control>
                        {mode === 'AddDraft' && (
                            <Form.Text className='text-muted'>
                                Phoenixborn randomly selected for draft mode
                            </Form.Text>
                        )}
                    </Col>
                </Form.Group>
                {mode === 'AddDraft' ? (
                    <>
                        <h4>Click the button below to pick a card from 4 random options.</h4>
                        <Row>
                            <Col sm='3'></Col>
                            <Col>
                                <Button variant='info' onClick={onOpenDraftPicker} className='def'>
                                    Pick a Card
                                </Button>
                            </Col>
                        </Row>
                    </>
                ) : isDraftDeck ? (
                    <>
                        <h4>Add sideboard cards as rewards from defeating Chimera.</h4>
                        <Row>
                            <Col sm='3'></Col>
                            <Col>
                                <Button
                                    variant='secondary'
                                    onClick={onOpenSideboardPicker}
                                    className='def'
                                >
                                    Add Sideboard Card
                                </Button>
                            </Col>
                        </Row>
                    </>
                ) : (
                    <>
                        <h4>
                            You can type card names and quantities into the box below, or add them
                            using this lookup box.
                        </h4>

                        <Form.Group as={Row} controlId='cardLookup'>
                            <Form.Label column sm='3'>
                                Card
                            </Form.Label>
                            <Col sm='4'>
                                <Typeahead
                                    options={lookupCards}
                                    onChange={addCardChange}
                                    labelKey={'name'}
                                    ref={typeaheadRef}
                                    id='cardtypeahead'
                                />
                            </Col>
                            <Form.Label column sm='1'>
                                Count
                            </Form.Label>
                            <Col sm='2'>
                                <Form.Control
                                    as='input'
                                    onChange={onNumberToAddChange}
                                    defaultValue={numberToAdd.toString()}
                                />
                            </Col>
                            <Col sm='2'>
                                <button className='btn btn-primary def' onClick={onAddCard}>
                                    Add
                                </button>
                            </Col>
                        </Form.Group>
                    </>
                )}
                <TextArea
                    label='Cards'
                    rows='10'
                    value={cardList}
                    onChange={onCardListChange}
                    readOnly={isDraftDeck}
                />
                <Form.Group as={Row}>
                    <Form.Label
                        column
                        sm='3'
                        style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}
                    >
                        Sideboard
                        {isDraftDeck && (
                            <Button
                                variant='link'
                                size='sm'
                                onClick={toggleSideboardReadonly}
                                style={{
                                    marginLeft: '5px',
                                    padding: '0',
                                    fontSize: '1em',
                                    lineHeight: '1'
                                }}
                            >
                                {sideboardReadonly ? '🔒' : '🔓'}
                            </Button>
                        )}
                    </Form.Label>
                    <Col>
                        <textarea
                            rows={4}
                            className='form-control'
                            value={sideboardList}
                            onChange={onSideboardListChange}
                            readOnly={isDraftDeck && sideboardReadonly}
                        />
                    </Col>
                </Form.Group>
                <h4>Enter dice quantities into the box below, one per line e.g. 3 Charm</h4>
                <TextArea
                    label='Dice'
                    rows={isChimera ? 2 : 4}
                    value={diceList}
                    onChange={onDiceListChange}
                    disabled={isChimera}
                />
                <TextArea
                    label='Notes'
                    rows='4'
                    value={deckState.notes || ''}
                    onChange={(e) => onChange('notes', e)}
                />

                <div className='form-group'>
                    <div className='col-sm-offset-3 col-sm-8'>
                        <button type='submit' className='btn btn-success def' onClick={onSaveClick}>
                            Save Deck
                        </button>
                        <button className='btn btn-primary def' onClick={handleCancelClick}>
                            Cancel
                        </button>
                    </div>
                </div>
            </Form>
            {/* Draft mode card pickers */}
            {mode === 'AddDraft' && (
                <DraftCardPicker
                    show={draftState.showDraftPicker}
                    cards={draftState.draftCardOptions}
                    onCardSelected={onDraftCardSelected}
                    onClose={onCloseDraftPicker}
                    onRefresh={onRefreshDraftCards}
                    refreshesRemaining={draftState.refreshesRemaining}
                    onToggleLock={onToggleLockCard}
                    lockedIndices={draftState.lockedCardIndices}
                />
            )}
            {/* Sideboard card picker for both AddDraft and edit modes */}
            {(mode === 'AddDraft' || isDraftDeck) && (
                <DraftCardPicker
                    show={draftState.showSideboardPicker}
                    cards={draftState.draftCardOptions}
                    onCardSelected={onDraftSideboardCardSelected}
                    onClose={onCloseSideboardPicker}
                    onRefresh={onRefreshSideboardCards}
                    refreshesRemaining={draftState.refreshesRemaining}
                    onToggleLock={onToggleLockCard}
                    lockedIndices={draftState.lockedCardIndices}
                />
            )}
            {/* Confirmation modal for stage completion */}
            <Modal
                show={showConfirmationModal}
                onHide={onCancelStageCompletion}
                backdrop='static'
                keyboard={true}
            >
                <Modal.Header closeButton>
                    <Modal.Title>Stage Completion Confirmation</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>Have you completed the current stage?</p>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant='secondary' onClick={onCancelStageCompletion}>
                        No
                    </Button>
                    <Button variant='primary' onClick={onConfirmStageCompletion}>
                        Yes
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
}

DeckEditor.displayName = 'DeckEditor';

export default DeckEditor;
