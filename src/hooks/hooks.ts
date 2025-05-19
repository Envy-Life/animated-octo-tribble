import express, { Request, Response } from "express";
import { arbHookHandler } from "./arb_handler";
import { solHookHandler, verifyTransfer, verifyUSDC } from "./sol_handler";

async function hook_handler(req: Request, res: Response) {
    const { body, headers } = req;

    console.log(headers);
    
    
    // Handle the incoming webhook request
    switch (headers["authorization"]) {
        case "arbitrum":
            console.log("Arbitrum webhook data:", body);
            body.receipts.forEach((element : any) => { 
                arbHookHandler(element).catch(
                    error => console.log(error)
                );
            });
            break;
        case "solana":
            console.log("Solana webhook data:", body);
            body.forEach((element : any) => {
                if (verifyTransfer(element) && verifyUSDC(element)) {
                    solHookHandler(element).catch(
                        error => console.log(error)
                    );
                }
            });
            break;
        default:
            console.log("Unknown webhook type", body, headers);
            res.status(400).send("Unknown webhook type");
            break;
    }
    
    
    // Process the webhook data as needed
    // For example, you can send a response back to the sender
    res.status(200).send("Webhook received successfully");
}



export { hook_handler };