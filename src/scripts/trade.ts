import { ethers } from "ethers";
import { Hyperliquid } from "hyperliquid";

// const sdk = new Hyperliquid({
//     enableWs: false, // boolean (OPTIONAL) - Enable/disable WebSocket functionality, defaults to true
//     privateKey: process.env.HL_SECRET_KEY,
//     walletAddress: process.env.HL_ACCOUNT_ADDRESS
//   });


async function long(sdk : Hyperliquid, agentSDK : Hyperliquid,ticker: string, leverage: number, size: number) {
    await sdk.ensureInitialized()

    console.log(`Longing ${size} ${ticker} with ${leverage}x leverage`);

    const metadata = await sdk.info.perpetuals.getMeta()

    const assetId = metadata.universe.findIndex((perp) => perp.name.startsWith(ticker.toUpperCase()))

    const tickerMetadata = metadata.universe[assetId]

    if (!assetId) {
        console.error(`Error: ${ticker} is not a valid asset`);
        return;
    }
    
    const assetCtx = (await sdk.info.perpetuals.getMetaAndAssetCtxs())[1][assetId]
    console.log(assetCtx);

    await agentSDK.exchange.updateLeverage(
        tickerMetadata.name, "cross", leverage
    )

    const tx = await agentSDK.custom.marketOpen(
        tickerMetadata.name,
        true,
        Math.round(100 * size / Number(assetCtx.markPx)) / 100,
    );

    console.log(tx);
    
}

async function short(sdk : Hyperliquid, agentSDK : Hyperliquid,ticker: string, leverage: number, size: number) {
    await sdk.ensureInitialized()

    console.log(`Shorting ${size} ${ticker} with ${leverage}x leverage`);

    const metadata = await sdk.info.perpetuals.getMeta()

    const assetId = metadata.universe.findIndex((perp) => perp.name.startsWith(ticker.toUpperCase()))

    const tickerMetadata = metadata.universe[assetId]

    if (!assetId) {
        console.error(`Error: ${ticker} is not a valid asset`);
        return;
    }
    
    const assetCtx = (await sdk.info.perpetuals.getMetaAndAssetCtxs())[1][assetId]
    console.log(assetCtx);

    await agentSDK.exchange.updateLeverage(
        tickerMetadata.name, "cross", leverage
    )

    const tx = await agentSDK.custom.marketOpen(
        tickerMetadata.name, 
        false,
        Math.round(100 * size / Number(assetCtx.markPx)) / 100,
    );

    console.log(tx);
    console.log(tx.response);
    
    
}

async function close(sdk : Hyperliquid,ticker: string) {
    await sdk.ensureInitialized()

    console.log(`Closing ${ticker}`);

    const metadata = await sdk.info.perpetuals.getMeta()
    console.log(metadata);

    const assetId = metadata.universe.findIndex((perp) => perp.name.startsWith(ticker.toUpperCase()))
    console.log(assetId);

    const tickerMetadata = metadata.universe[assetId]

    if (!assetId) {
        console.error(`Error: ${ticker} is not a valid asset`);
        return;
    }

    const assetCtx = (await sdk.info.perpetuals.getMetaAndAssetCtxs())[1][assetId]
    console.log(assetCtx);

    const tx = await sdk.custom.marketClose(tickerMetadata.name);

    console.log(tx);

}

export { long, short, close };