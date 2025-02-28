import { Client, fetchExchange, gql } from "urql";
import axios from "axios";
import fs from "fs";

const assetMap = JSON.parse(
  fs.readFileSync("./assets_by_id_28-02-2025.json", "utf-8")
);

const client = new Client({
  url: "https://indexer.hyperindex.xyz/bb34868/v1/graphql",
  exchanges: [fetchExchange],
});

const TELEGRAM_BOT_URL = "https://dieselbot.onrender.com/echo";

let lastTimestamp = 1740768214;

let ETH_ID =
  "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07";

async function queryDB(query: string, variables: any) {
  //   if (!process.env.GRAPHQL_URL) {
  //     throw new Error("https://indexer.hyperindex.xyz/bb34868/v1/graphql");
  //   }

  const response = await fetch(
    "https://indexer.hyperindex.xyz/bb34868/v1/graphql",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    }
  );

  const data = await response.json();

  return data;
}

const getNewTransactions = async () => {
  const transactionQuery = `
    query NewTransactions($lastTimestamp: Int) {
      Transaction(
        where: {
          transaction_type: { _eq: "SWAP" }
          time: { _gt: $lastTimestamp }
        }
        order_by: { time: desc }
        limit: 30
      ) {
        asset_0_in
        asset_0_out
        asset_1_in
        asset_1_out
        block_time
        time
        extra
        id
        initiator
        pool_id
      }
    }
  `;

  try {
    const variables = {
      lastTimestamp,
    };

    const result = await queryDB(transactionQuery, variables);
    console.log(result, "res");

    return result.data.Transaction;
  } catch (error) {
    console.error("Error fetching new transactions:", error);
    return [];
  }
};

const sendToTelegramBot = async (data: any) => {
  try {
    await axios.post(TELEGRAM_BOT_URL, { data });
    console.log("Sent data to bot:", data);
  } catch (error) {
    console.error("Error sending data to bot:", error);
  }
};

export const getBotData = async (
  asset_0: string,
  asset_1: string,
  tx: any,
  id: any
) => {
  if (asset_0 === ETH_ID) {
    const eth_in = tx.asset_0_in;
    const asset_out = tx.asset_1_out;

    const asset_bought = assetMap[asset_1];

    return {
      eth_in,
      asset_out,
      asset_bought,
      trx_hash: id,
    };
  } else if (asset_1 === ETH_ID) {
    const eth_in = tx.asset_1_in / 10 ** 9;

    const asset_bought = assetMap[asset_0];

    const asset_out = tx.asset_0_out / 10 ** asset_bought.decimals;

    return {
      eth_in,
      asset_out,
      asset_bought,
      trx_hash: id,
    };
  }
};

const monitorTransactions = async () => {
  while (true) {
    const transactions = await getNewTransactions();

    for (const transaction of transactions) {
      const isExtra = Boolean(JSON.parse(transaction.extra));

      if (isExtra) {
        const extraTx = JSON.parse(transaction.extra)[0];
        const [asset_0, asset_1, is_stable] = extraTx.pool_id.split("_");

        const data = await getBotData(
          asset_0,
          asset_1,
          extraTx,
          transaction.id
        );

        if (data?.eth_in !== 0 && data?.asset_out !== 0) {
          await sendToTelegramBot(data);
        }
      } else {
        const [asset_0, asset_1, is_stable] = transaction.pool_id.split("_");

        const data = await getBotData(
          asset_0,
          asset_1,
          transaction,
          transaction.id
        );
        console.log(data);

        if (data?.eth_in !== 0 && data?.asset_out !== 0) {
          await sendToTelegramBot(data);

          //   if (asset_0 === PSYCHO_ID || asset_1 === PSYCHO_ID) {
          //     const botCallPsycho = await axios.post(
          //       "https://dieselbot.onrender.com/echo-bot2",
          //       {
          //         data,
          //       }
          //     );
          //   }
        }
      }
      lastTimestamp = transaction.time;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Poll every 5 seconds
  }
};

monitorTransactions();
