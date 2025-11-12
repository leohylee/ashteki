import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Row, Col, Form } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import CardImage from '../GameBoard/CardImage';
import './DraftCardPicker.scss';

const DraftCardPicker = ({ show, cards, onCardSelected, onClose, onRefresh, refreshesRemaining, onToggleLock, lockedIndices }) => {
    const [selectedCard, setSelectedCard] = useState(null);
    const [quantity, setQuantity] = useState(3);

    useEffect(() => {
        // Reset selection when new cards are shown (only reset selection, not the cards)
        setSelectedCard(null);
        setQuantity(3);
    }, [cards]);

    const handleCardClick = (card) => {
        setSelectedCard(card);
    };

    const handleQuantityChange = (e) => {
        const value = parseInt(e.target.value) || 1;
        setQuantity(Math.max(1, Math.min(3, value))); // Limit between 1-3
    };

    const handleConfirm = () => {
        if (selectedCard) {
            onCardSelected(selectedCard, quantity);
            setSelectedCard(null);
            setQuantity(3);
        }
    };

    const handleClose = () => {
        setSelectedCard(null);
        onClose();
    };

    if (!cards || cards.length === 0) {
        return null;
    }

    return (
        <Modal
            show={show}
            onHide={handleClose}
            size="xl"
            backdrop={true}
            keyboard={true}
        >
            <Modal.Header closeButton>
                <Modal.Title>Pick a Card</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                        <div className="draft-card-picker-info">
                            <p>Select one card from the options below to add to your deck:</p>
                            <p className="lock-hint">Click the lock icon to keep one card when refreshing</p>
                            <div className="draft-refresh-info">
                                <Button
                                    variant="success"
                                    onClick={onRefresh}
                                    disabled={refreshesRemaining === 0}
                                    className="refresh-btn"
                                >
                                    <FontAwesomeIcon icon={faSync} /> Refresh Cards
                                </Button>
                                <span className="refresh-counter">
                                    Refreshes remaining: <strong>{refreshesRemaining}</strong>
                                </span>
                            </div>
                        </div>
                        <div className="draft-card-options-row">
                            {cards.map((card, index) => {
                                const isLocked = lockedIndices.includes(index);
                                return (
                                    <div key={index} className="draft-card-option">
                                        <div
                                            className={`draft-card-wrapper ${selectedCard?.stub === card.stub ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                                            onClick={() => handleCardClick(card)}
                                        >
                                            <button
                                                className="lock-button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onToggleLock(index);
                                                }}
                                                title={isLocked ? "Unlock card" : "Lock card"}
                                            >
                                                <FontAwesomeIcon icon={isLocked ? faLock : faLockOpen} />
                                            </button>
                                            <CardImage card={{ id: card.stub, imageStub: card.stub }} noIndex={true} />
                                            <div className="card-name">{card.name}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {selectedCard && (
                            <div className="draft-quantity-selector">
                                <Form.Group>
                                    <Form.Label>Quantity:</Form.Label>
                                    <Form.Control
                                        type="number"
                                        min="1"
                                        max="3"
                                        value={quantity}
                                        onChange={handleQuantityChange}
                                        style={{ width: '100px', display: 'inline-block', marginLeft: '10px' }}
                                    />
                                </Form.Group>
                            </div>
                        )}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    variant="primary"
                    onClick={handleConfirm}
                    disabled={!selectedCard}
                >
                    Add Card
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

DraftCardPicker.displayName = 'DraftCardPicker';
DraftCardPicker.propTypes = {
    show: PropTypes.bool.isRequired,
    cards: PropTypes.array.isRequired,
    onCardSelected: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onRefresh: PropTypes.func.isRequired,
    refreshesRemaining: PropTypes.number.isRequired,
    onToggleLock: PropTypes.func.isRequired,
    lockedIndices: PropTypes.array.isRequired
};

export default DraftCardPicker;
