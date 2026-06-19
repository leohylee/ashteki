import React from 'react';
import classNames from 'classnames';
import './Avatar.scss';
import { storageBaseUrl } from '../../constants';
import defaultAvatar from '../../assets/img/default-avatar.svg';

// When an avatar can't be loaded (offline, or missing in storage), fall back to a bundled
// local default so we never show a broken image. Guarded so it only swaps once.
const handleAvatarError = (event) => {
    const img = event.target;
    if (img.dataset.fallbackApplied) {
        return;
    }
    img.dataset.fallbackApplied = 'true';
    img.src = defaultAvatar;
};

/**
 * @typedef AvatarProps
 * @property {boolean} [float] Whether or not to float the image
 * @property {string} imgPath The username whose avatar to display
 */

/**
 *
 * @param {AvatarProps} props
 */
const Avatar = ({ float, imgPath }) => {
    const className = classNames('gravatar', {
        'pull-left': float
    });

    if (!imgPath) {
        return null;
    }

    const imgUrl = storageBaseUrl
        ? `${storageBaseUrl}/avatars/${imgPath}.png`
        : `/img/avatar/${imgPath}.png`;

    return <img className={className} src={imgUrl} alt='' onError={handleAvatarError} />;
};

export default Avatar;
