import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLink, faStarOfLife } from '@fortawesome/free-solid-svg-icons';
import CardImage from '../GameBoard/CardImage';
import classNames from 'classnames';

const CardListText = ({ deckCards, highlight, onFFClick, isSideboard, isDraftMode, mainDeckCards, onSwapCard, onQuantityChange, editMode }) => {
    let [zoomCard, setZoomCard] = useState(null);
    let [mousePos, setMousePosition] = useState({ x: 0, y: 0 });

    const usesHighlightMagic = (card) => {
        return card.card.dice?.includes(highlight) || card.card.altDice?.includes(highlight);
    };

    const getCardsToRender = () => {
        let cardsToRender = [];
        let groupedCards = {};

        deckCards.forEach((card) => {
            let type = card.card.type;

            if (type === 'character' || type === 'event') {
                type = card.card.side + ` ${type}`;
            }
            if (!groupedCards[type]) {
                groupedCards[type] = [card];
            } else {
                groupedCards[type].push(card);
            }
        });

        for (let key in groupedCards) {
            let cardList = groupedCards[key];
            let cards = [];
            let count = 0;

            cardList.forEach((card) => {
                let chainedIcon = null;
                if (card.card.isChained) {
                    chainedIcon = (
                        <FontAwesomeIcon icon={faLink} title='This card is on the chained list' />
                    );
                }
                let ffIcon = null;
                if (card.ff) {
                    ffIcon = <FontAwesomeIcon
                        className='card-ff'
                        icon={faStarOfLife}
                        title='This card is in your first five'
                        onClick={() => onFFClick && onFFClick(card.id)}
                    />
                }
                const linkClasses = classNames('card-link', {
                    unique: card.phoenixborn,
                    highlight: usesHighlightMagic(card)
                });
                const countClass = card.count > 3 && !card.card?.type.includes('Conjur') ? 'invalidCount' : '';

                // Add quantity controls for draft mode (only in edit mode)
                let quantityControls = null;
                if (editMode && isDraftMode && onQuantityChange && !card.card?.type.includes('Conjur')) {
                    quantityControls = (
                        <span style={{ marginLeft: '5px' }}>
                            <button
                                onClick={() => onQuantityChange(card.id, card.count - 1, isSideboard)}
                                disabled={card.count <= 1}
                                style={{
                                    padding: '0 6px',
                                    fontSize: '0.8em',
                                    cursor: card.count <= 1 ? 'not-allowed' : 'pointer'
                                }}
                            >
                                -
                            </button>
                            <button
                                onClick={() => onQuantityChange(card.id, card.count + 1, isSideboard)}
                                disabled={card.count >= 3}
                                style={{
                                    padding: '0 6px',
                                    fontSize: '0.8em',
                                    marginLeft: '2px',
                                    cursor: card.count >= 3 ? 'not-allowed' : 'pointer'
                                }}
                            >
                                +
                            </button>
                        </span>
                    );
                }

                // Add swap dropdown for sideboard cards in draft mode (only in edit mode)
                let swapControl = null;
                if (editMode && isSideboard && isDraftMode && mainDeckCards && mainDeckCards.length > 0 && onSwapCard) {
                    swapControl = (
                        <select
                            onChange={(e) => {
                                if (e.target.value) {
                                    onSwapCard(card.id, e.target.value);
                                    e.target.value = ''; // Reset selection
                                }
                            }}
                            style={{ marginLeft: '10px', fontSize: '0.8em' }}
                        >
                            <option value="">Swap with...</option>
                            {mainDeckCards.map((mainCard) => (
                                <option key={mainCard.id} value={mainCard.id}>
                                    {mainCard.card.name}
                                </option>
                            ))}
                        </select>
                    );
                }

                cards.push(
                    <div key={'text-' + card.card.id}>
                        <span className={countClass}>{card.count + 'x '}</span>
                        <span
                            className={linkClasses}
                            onMouseOver={() => setZoomCard(card)}
                            onMouseMove={(event) => {
                                let y = event.clientY;
                                let yPlusHeight = y + 420;

                                if (yPlusHeight >= window.innerHeight) {
                                    y -= yPlusHeight - window.innerHeight;
                                }

                                setMousePosition({ x: event.clientX, y: y });
                            }}
                            onMouseOut={() => setZoomCard(null)}
                        >
                            {card.card.name}
                        </span>
                        &nbsp;
                        {chainedIcon}
                        {ffIcon}
                        {quantityControls}
                        {swapControl}
                    </div>
                );
                count += parseInt(card.count);
            });

            cardsToRender.push(
                <div className='cards-no-break'>
                    <div className='card-group-title'>{key + ' (' + count.toString() + ')'}</div>
                    <div key={key} className='deck-card-group'>
                        {cards}
                    </div>
                </div>
            );
        }

        return cardsToRender;
    };

    return (
        <>
            {zoomCard && (
                <div
                    className='decklist-card-zoom'
                    style={{ left: mousePos.x + 5 + 'px', top: mousePos.y + 'px' }}
                >
                    <CardImage
                        card={Object.assign({}, zoomCard, zoomCard.card, zoomCard.cardData)}
                    />
                </div>
            )}
            <div className='cards'>{getCardsToRender(deckCards)}</div>
        </>
    );
};

export default CardListText;
