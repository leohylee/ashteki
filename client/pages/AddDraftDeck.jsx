import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Col, Row } from 'react-bootstrap';

import DeckEditor from '../Components/Decks/DeckEditor';
import AlertPanel from '../Components/Site/AlertPanel';
import DeckSummary from '../Components/Decks/DeckSummary';
import DeckHeader from '../Components/Decks/DeckHeader';
import { addDraftDeck, saveDeck } from '../redux/actions';

export function AddDraftDeckPage() {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const apiError = useSelector((state) => state.api.message);
    const deck = useSelector((state) => state.cards.selectedDeck);
    const deckSaved = useSelector((state) => state.cards.deckSaved);
    const loading = useSelector((state) => state.api.loading);

    useEffect(() => {
        dispatch(addDraftDeck());
    }, [dispatch]);

    useEffect(() => {
        if (deckSaved) {
            navigate('/decks');
        }
    }, [deckSaved, navigate]);

    const onAddDeck = (deckToSave) => {
        dispatch(saveDeck(deckToSave));
    };

    if (loading) {
        return <div>Loading decks from the server...</div>;
    } else if (apiError) {
        return <AlertPanel type='error' message={apiError} />;
    }

    return (
        <div className='full-height'>
            <Row>
                <Col lg={6} className='full-height'>
                    <div className='lobby-card'>
                        <div className='lobby-header'>Draft Deck Editor</div>

                        <DeckEditor deck={deck} mode='AddDraft' onDeckSave={onAddDeck} />
                    </div>
                </Col>
                <Col lg={6}>
                    <div className='lobby-card'>
                        <DeckHeader deck={deck} />
                        <DeckSummary deck={deck} />
                    </div>
                </Col>
            </Row>
        </div>
    );
}

AddDraftDeckPage.displayName = 'AddDraftDeck';

export default AddDraftDeckPage;
