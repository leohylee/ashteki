/*
 * Card image integrity scan + downloader.
 *
 * Verifies that every card image the client can request exists locally in public/cards,
 * and downloads any that are missing. Mirrors the client's image resolution:
 *   - plain stub            -> public/cards/<stub>.jpg, sourced from cdn.ashes.live
 *   - stub already with ext -> public/cards/<stub>,     sourced from cdn.ashes.live
 *   - cdn.ashteki.com URL   -> public/cards/<basename>, sourced from that URL
 *   - "%s" templated stubs  -> expanded to chimera phases 1-3
 * Also covers the hard-coded card backs referenced by util.getCardBack().
 *
 * Usage:
 *   node server/scripts/imageIntegrity.js            # scan and download missing
 *   node server/scripts/imageIntegrity.js --check    # scan only, exit 1 if anything missing
 *
 * Mongo connection: set MONGO_URL (defaults to mongodb://127.0.0.1:27017/ashteki).
 * Inside Docker:    MONGO_URL=mongodb://mongo:27017/ashteki node server/scripts/imageIntegrity.js
 */
const monk = require('monk');
const fs = require('fs');
const path = require('path');

const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/ashteki';
const cardsDir = path.join(__dirname, '../../public/cards');
const ASHES_LIVE = 'https://cdn.ashes.live/images/cards';
const CHIMERA_PHASES = [1, 2, 3];
const checkOnly = process.argv.includes('--check');

// Card backs referenced by getCardBack() but not present as rows in the cards collection.
const EXTRA_REFS = [
    'back.jpg',
    'back-blood-1.jpg',
    'back-blood-2.jpg',
    'back-conjuration.jpg',
    'https://cdn.ashteki.com/ashes/db-back-1.jpg',
    'https://cdn.ashteki.com/ashes/db-back-2.jpg'
];

function expand(ref) {
    if (!ref) {
        return [];
    }
    return ref.includes('%s') ? CHIMERA_PHASES.map((p) => ref.replace('%s', p)) : [ref];
}

// Map an image reference to its local file name and the URL it can be downloaded from.
function resolve(ref) {
    if (ref.includes('http')) {
        return { file: ref.split('/').pop(), url: ref };
    }
    const file = ref.includes('.') ? ref : `${ref}.jpg`;
    return { file, url: `${ASHES_LIVE}/${file}` };
}

async function main() {
    if (!fs.existsSync(cardsDir)) {
        fs.mkdirSync(cardsDir, { recursive: true });
    }

    const db = monk(mongoUrl);
    try {
        const cards = await db.get('cards').find({});
        if (!cards.length) {
            console.error(
                'No cards found in the database. Run importdata/importprecons first ' +
                    `(MONGO_URL=${mongoUrl}).`
            );
            return 1;
        }

        const refs = new Set(EXTRA_REFS);
        for (const card of cards) {
            for (const ref of expand(card.imageStub || card.stub)) {
                refs.add(ref);
            }
        }

        // Deduplicate by local file name.
        const byFile = new Map();
        for (const ref of refs) {
            const target = resolve(ref);
            if (!byFile.has(target.file)) {
                byFile.set(target.file, target);
            }
        }

        const missing = [...byFile.values()].filter(
            (t) => !fs.existsSync(path.join(cardsDir, t.file))
        );

        console.log(
            `Card images: ${byFile.size} total | ${byFile.size - missing.length} present | ` +
                `${missing.length} missing`
        );

        if (missing.length === 0) {
            console.log('All card images present. ✔');
            return 0;
        }

        if (checkOnly) {
            console.log('Missing:\n  ' + missing.map((m) => m.file).join('\n  '));
            console.log('\nRun without --check to download them.');
            return 1;
        }

        let downloaded = 0;
        const failed = [];
        for (const target of missing) {
            try {
                const res = await fetch(target.url);
                const contentType = res.headers.get('content-type') || '';
                if (res.ok && contentType.includes('image')) {
                    fs.writeFileSync(
                        path.join(cardsDir, target.file),
                        Buffer.from(await res.arrayBuffer())
                    );
                    downloaded++;
                    console.log(`  ✓ ${target.file}`);
                } else {
                    failed.push(`${target.file} [${res.status} ${contentType}] <- ${target.url}`);
                }
            } catch (err) {
                failed.push(`${target.file} [${err.message}] <- ${target.url}`);
            }
        }

        console.log(`\nDownloaded ${downloaded}, failed ${failed.length}.`);
        if (failed.length) {
            console.log('Could not download:\n  ' + failed.join('\n  '));
            return 1;
        }
        return 0;
    } finally {
        await db.close();
    }
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
