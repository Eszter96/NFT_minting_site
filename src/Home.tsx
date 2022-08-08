import { useEffect, useMemo, useState, useCallback } from "react";
import * as anchor from "@project-serum/anchor";
import styled from "styled-components";
import { Container, Snackbar } from "@material-ui/core";
import Paper from "@material-ui/core/Paper";
import Alert from "@material-ui/lab/Alert";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import {
  Commitment,
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  awaitTransactionSignatureConfirmation,
  CANDY_MACHINE_PROGRAM,
  CandyMachineAccount,
  createAccountsForMint,
  getCandyMachineState,
  getCollectionPDA,
  SetupState,
  mintMultipleToken,
} from "./candy-machine";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletDialogButton } from "@solana/wallet-adapter-material-ui";
import { AlertState, toDate, formatNumber, getAtaForMint } from "./utils";
import { MintCountdown } from "./MintCountdown";
import { MintButton } from "./MintButton";
import { GatewayProvider } from "@civic/solana-gateway-react";
import { sendTransaction } from "./connection";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

import confetti from "canvas-confetti";
import { WalletMultiButton } from "@solana/wallet-adapter-material-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import Box from "@material-ui/core/Box";
import Dialog from "@material-ui/core/Dialog";
import { DialogTitle } from "@material-ui/core";
import Backdrop from "@material-ui/core/Backdrop";
import CircularProgress from "@material-ui/core/CircularProgress";
import { programs } from "@metaplex/js";

import { NFTcounter } from "./NFTcounter";

import { Swiper, SwiperSlide } from "swiper/react/swiper-react";
import "swiper/swiper.min.css";
import "swiper/modules/pagination/pagination.min.css";
import "swiper/swiper-bundle.min.css";
import "swiper/swiper-bundle.css";
import "swiper/swiper.scss";

import { Pagination, Navigation } from "swiper";
import "./Home.css";
import axios from "axios";

const {
  metadata: { Metadata },
} = programs;

const ConnectButton = styled(WalletDialogButton)`
  width: 100%;
  height: 60px;
  margin-top: 10px;
  margin-bottom: 5px;
  background: linear-gradient(#7fff2f 0%, #2fb62f 100%);
  color: white;
  font-size: 16px;
  font-weight: bold;
  opacity: 1;
  -moz-transition: all 0.2s ease-in-out;
  -webkit-transition: all 0.2s ease-in-out;
  -ms-transition: all 0.2s ease-in-out;
  -o-transition: all 0.2s ease-in-out;
  transition: all 0.2s ease-in-out;
  :hover {
    opacity: 0.8;
  }
`;

const MintContainer = styled.div``; // add your owns styles here

export interface HomeProps {
  candyMachineId?: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  txTimeout: number;
  rpcHost: string;
  network: WalletAdapterNetwork;
  error?: string;
}

const Home = (props: HomeProps) => {
  const [isUserMinting, setIsUserMinting] = useState(false);
  const [candyMachine, setCandyMachine] = useState<CandyMachineAccount>();
  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });
  const [isActive, setIsActive] = useState(false);
  const [currentShift, setCurrentShift] = useState<number>(0);
  const [endDate, setEndDate] = useState<Date>();
  const [itemsRemaining, setItemsRemaining] = useState<number>();
  const [isWhitelistUser, setIsWhitelistUser] = useState(false);
  const [isPresale, setIsPresale] = useState(false);
  const [isValidBalance, setIsValidBalance] = useState(false);
  const [discountPrice, setDiscountPrice] = useState<anchor.BN>();
  const [needTxnSplit, setNeedTxnSplit] = useState(true);
  const [setupTxn, setSetupTxn] = useState<SetupState>();

  const rpcUrl = props.rpcHost;
  const wallet = useWallet();
  //console.log(wallet);
  const cluster = props.network;
  const anchorWallet = useMemo(() => {
    console.log("useMemo");
    if (
      !wallet ||
      !wallet.publicKey ||
      !wallet.signAllTransactions ||
      !wallet.signTransaction
    ) {
      console.log("useMemo return");
      return;
    }

    return {
      publicKey: wallet.publicKey,
      signAllTransactions: wallet.signAllTransactions,
      signTransaction: wallet.signTransaction,
    } as anchor.Wallet;
  }, [wallet]);

  const [nftsMintedByOwner, setNFTs] = useState<any>([]);
  const [mintCount, setMintCount] = useState(1);
  const [totalCost, setTotalCost] = useState(0);
  const [price, setPrice] = useState(0);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  const solFeesEstimation = 0.012;

  const refreshCandyMachineState = useCallback(
    async (commitment: Commitment = "processed") => {
      if (!anchorWallet) {
        return;
      }
      if (props.error !== undefined) {
        setAlertState({
          open: true,
          message: props.error,
          severity: "error",
          hideDuration: null,
        });
        return;
      }

      const connection = new Connection(props.rpcHost, commitment);
      console.log(connection);
      console.log(wallet.publicKey);
      if (props.candyMachineId) {
        try {
          const cndy = await getCandyMachineState(
            anchorWallet,
            props.candyMachineId,
            connection
          );

          const currentSlot = await connection.getSlot();
          const blockTime = (await connection.getBlockTime(
            currentSlot
          )) as number;
          const shift = new Date().getTime() / 1000 - blockTime;

          let active =
            cndy?.state.goLiveDate?.toNumber() + shift <
            new Date().getTime() / 1000;
          let presale = false;
          let price = formatNumber.asNumber(cndy.state.price);
          setPrice(price!);
          let cost = mintCount * (price! + solFeesEstimation);
          setTotalCost(cost);
          // duplication of state to make sure we have the right values!
          let userPrice = cndy.state.price;

          console.log(
            "refreshCandyMachineState cndy?.state.tokenMint: ",
            cndy?.state.tokenMint
          );
          if (cndy?.state.tokenMint) {
            // retrieves the SPL token
            const mint = new anchor.web3.PublicKey(cndy.state.tokenMint);
            // ATA ~ associated token account
            const token = (
              await getAtaForMint(mint, anchorWallet.publicKey)
            )[0];
            try {
              const balance = await connection.getTokenAccountBalance(token);
              const valid = new anchor.BN(balance.value.amount).gte(userPrice);

              // only allow user to mint if token balance >  the user if the balance > 0
              setIsValidBalance(valid);
              active = active && valid;
            } catch (e) {
              setIsValidBalance(false);
              active = false;
              // no whitelist user, no mint
              console.log("There was a problem fetching SPL token balance");
              console.log(e);
            }
          } else {
            const balance = new anchor.BN(
              await connection.getBalance(anchorWallet.publicKey)
            );
            const valid = balance.gte(userPrice);
            setIsValidBalance(valid);
            active = active && valid;
          }

          // datetime to stop the mint?
          if (cndy?.state.endSettings?.endSettingType.date) {
            setEndDate(
              toDate(cndy.state.endSettings.number.add(new anchor.BN(shift)))
            );
            if (
              new Date().getTime() / 1000 >
              cndy.state.endSettings.number.toNumber() + shift
            ) {
              active = false;
            }
          }
          // amount to stop the mint?
          if (cndy?.state.endSettings?.endSettingType.amount) {
            let limit = Math.min(
              cndy.state.endSettings.number.toNumber(),
              cndy.state.itemsAvailable
            );
            if (cndy.state.itemsRedeemed < limit) {
              setItemsRemaining(limit - cndy.state.itemsRedeemed);
            } else {
              setItemsRemaining(0);
              cndy.state.isSoldOut = true;
            }
          } else {
            setItemsRemaining(cndy.state.itemsRemaining);
          }

          if (cndy.state.isSoldOut) {
            active = false;
          }
          // Program derived address
          const [collectionPDA] = await getCollectionPDA(props.candyMachineId);
          const collectionPDAAccount = await props.connection.getAccountInfo(
            collectionPDA
          );
          setIsActive((cndy.state.isActive = active));
          setCurrentShift(shift);

          setIsPresale((cndy.state.isPresale = presale));
          setCandyMachine(cndy);

          const txnEstimate =
            892 +
            (!!collectionPDAAccount && cndy.state.retainAuthority ? 182 : 0) +
            (cndy.state.tokenMint ? 66 : 0) +
            (cndy.state.whitelistMintSettings ? 34 : 0) +
            (cndy.state.whitelistMintSettings?.mode?.burnEveryTime ? 34 : 0) +
            (cndy.state.gatekeeper ? 33 : 0) +
            (cndy.state.gatekeeper?.expireOnUse ? 66 : 0);

          setNeedTxnSplit(txnEstimate > 1230);
        } catch (e) {
          if (e instanceof Error) {
            if (
              e.message === `Account does not exist ${props.candyMachineId}`
            ) {
              setAlertState({
                open: true,
                message: `Couldn't fetch candy machine state from candy machine with address: ${props.candyMachineId}, using rpc: ${props.rpcHost}! You probably typed the REACT_APP_CANDY_MACHINE_ID value in wrong in your .env file, or you are using the wrong RPC!`,
                severity: "error",
                hideDuration: null,
              });
            } else if (
              e.message.startsWith("failed to get info about account")
            ) {
              setAlertState({
                open: true,
                message: `Couldn't fetch candy machine state with rpc: ${props.rpcHost}! This probably means you have an issue with the REACT_APP_SOLANA_RPC_HOST value in your .env file, or you are not using a custom RPC!`,
                severity: "error",
                hideDuration: null,
              });
            }
          } else {
            setAlertState({
              open: true,
              message: `${e}`,
              severity: "error",
              hideDuration: null,
            });
          }
          console.log(e);
        }
      } else {
        setAlertState({
          open: true,
          message: `Your REACT_APP_CANDY_MACHINE_ID value in the .env file doesn't look right! Make sure you enter it in as plain base-58 address!`,
          severity: "error",
          hideDuration: null,
        });
      }

      //await collectNftsFromWallet();
    },
    [anchorWallet, props.candyMachineId, props.error, props.rpcHost]
  );

  function getSum(array: any) {
    let sum = 0;
    array.map((score: number) => (sum += score));
    return sum;
  }

  const analyseAttributes = async (attributes: any) => {
    let traits = ["Background", "Parrots", "Monkeys", "Glasses", "Headscarf"];
    let scores: any = {};
    let category = "";
    await attributes.map((nft: any) => {
      if (traits.includes(nft.trait_type)) {
        if (nft.value === "blank") {
          scores[nft.trait_type] = 0;
        } else if (nft.value.includes("R")) {
          scores[nft.trait_type] = 2;
        } else if (nft.value.includes("L")) {
          scores[nft.trait_type] = 3;
        } else {
          scores[nft.trait_type] = 1;
        }
      }
    });
    //console.log(scores);
    let sum = getSum(Object.values(scores));
    if (sum === 13) {
      category = "legendary";
    } else if (sum === 12 && scores["Parrots"] === 3) {
      category = "veryRare";
    } else if (sum === 12 && scores["Headscarf"] === 3) {
      category = "veryRare";
    } else if (sum === 11 && scores["Background"] === 1) {
      category = "rare";
    } else if (sum === 11 && scores["Headscarf"] >= 2) {
      category = "rare";
    } else if (
      scores["Parrots"] === 3 &&
      scores["Headscarf"] == 3 &&
      getSum([scores["Background"], scores["Monkeys"], scores["Glasses"]]) === 6
    ) {
      category = "rare";
    } else if (scores["Glasses"] == 3 && sum - scores["Glasses"] === 12) {
      category = "rare";
    } else if (
      scores["Parrots"] === 0 &&
      scores["Monkeys"] === 0 &&
      sum === 6
    ) {
      category = "rare";
    } else if (
      scores["Parrots"] === 3 &&
      scores["Headscarf"] == 3 &&
      getSum([scores["Background"], scores["Monkeys"], scores["Glasses"]]) === 4
    ) {
      category = "rare";
    } else if (sum === 11 && scores["Headscarf"] === 1) {
      category = "above average";
    } else if (scores["Glasses"] === 3 && sum - scores["Glasses"] === 7) {
      category = "above average";
    } else if (scores["Headscarf"] === 3 && sum - scores["Headscarf"] === 7) {
      category = "above average";
    } else if (
      sum === 10 &&
      scores["Headscarf"] >= 2 &&
      scores["Glasses"] >= 2
    ) {
      category = "above average";
    } else if (sum === 8 && scores["Monkeys"] === 0) {
      category = "above average";
    } else if (sum === 7 && scores["Parrots"] === 0) {
      category = "above average";
    } else if (sum === 9 || sum === 10 || sum) {
      category = "average";
    } else if (sum === 7 || sum === 8) {
      category = "average";
    } else if (sum === 6) {
      category = "average";
    } else if (sum === 5) {
      category = "average";
    } else if (sum === 4) {
      category = "average";
    } else if (sum === 3) {
      category = "average";
    }
    return { scores, category };
  };

  const getNFTs = async (uri: any) => {
    let response;
    try {
      response = await axios.get(uri);
    } catch (error) {
      console.log(error);
    }
    let rarity = await analyseAttributes(response?.data.attributes);
    let image: string = response?.data.image;
    return { image, rarity };
  };

  const collectNftsFromWallet = async () => {
    const nftsmetadata = await Metadata.findDataByOwner(
      props.connection,
      anchorWallet!.publicKey
    );

    let NFTsfromCollection = await Promise.all(
      nftsmetadata
        .filter(
          (nft) =>
            nft.data.name.includes("TD") && nft.data.symbol == "TDNFTtest"
        )
        .map((nftData) => getNFTs(nftData.data.uri))
    ).then((value) => {
      return value;
    });

    console.log("collectNftsFromWallet: ", NFTsfromCollection.length);

    setNFTs(NFTsfromCollection);
  };

  function throwConfetti(): void {
    confetti({
      particleCount: 400,
      spread: 70,
      origin: { y: 0.6 },
    });

    setAlertState({
      open: true,
      message: `Congratulations! Mint succeeded!`,
      severity: "success",
      hideDuration: 7000,
    });
    setAlertState({
      open: true,
      message: `Page reloads in 10 seconds`,
      severity: "info",
      hideDuration: 1000,
    });
    /* setTimeout(function () {
      window.location.reload();
    }, 10000); */
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* async function mintMany(
    quantityString: number,
    beforeTransactions: Transaction[] = [],
    afterTransactions: Transaction[] = []
  ) {
    if (wallet && candyMachine?.program && wallet.publicKey) {
      const quantity = Number(quantityString);
      const futureBalance = (balance || 0) - price * quantity;
      const signedTransactions: any = await mintMultipleToken(
        candyMachine,
        wallet.publicKey,
        quantity,
        beforeTransactions,
        afterTransactions,
        setupMint ?? setupTxn
      );

      const promiseArray = [];
      console.log(signedTransactions);
      for (let index = 0; index < signedTransactions.length; index++) {
        const tx = signedTransactions[index];
        promiseArray.push(
          awaitTransactionSignatureConfirmation(
            tx,
            props.txTimeout,
            props.connection,
            true
          )
        );
      }
      console.log(promiseArray);
      const allTransactionsResult = await Promise.all(promiseArray);
      let totalSuccess = 0;
      let totalFailure = 0;
      console.log(allTransactionsResult);
      for (let index = 0; index < allTransactionsResult.length; index++) {
        const transactionStatus = allTransactionsResult[index];
        if (!transactionStatus?.err) {
          totalSuccess += 1;
        } else {
          totalFailure += 1;
        }
      }
      setLoading(true);
      let retry = 0;
      if (allTransactionsResult.length > 0) {
        let newBalance =
          (await props.connection.getBalance(wallet.publicKey)) /
          LAMPORTS_PER_SOL;

        while (newBalance > futureBalance && retry < 20) {
          await sleep(2000);
          newBalance =
            (await props.connection.getBalance(wallet.publicKey)) /
            LAMPORTS_PER_SOL;
          retry++;
          console.log(
            "Estimated balance (" +
              futureBalance +
              ") not correct yet, wait a little bit and re-check. Current balance : " +
              newBalance +
              ", Retry " +
              retry
          );
        }
      }

      await sleep(2000);
      setLoading(false);

      if (totalSuccess && retry < 20) {
        throwConfetti(quantity);

        // update front-end amounts
      }

      if (totalFailure || retry === 20) {
        setAlertState({
          open: true,
          message: `Some mints failed! (possibly ${totalFailure}) Wait a few minutes and check your wallet.`,
          severity: "error",
        });
      }

      if (totalFailure === 0 && totalSuccess === 0) {
        setAlertState({
          open: true,
          message: `Mints manually cancelled.`,
          severity: "error",
        });
      }
    } */
  //}

  const onMint = async (
    beforeTransactions: Transaction[] = [],
    afterTransactions: Transaction[] = []
  ) => {
    try {
      setIsUserMinting(true);
      document.getElementById("#identity")?.click();
      if (wallet.connected && candyMachine?.program && wallet.publicKey) {
        let setupMint: SetupState | undefined;
        if (needTxnSplit && setupTxn === undefined) {
          setAlertState({
            open: true,
            message: "Please sign account setup transaction",
            severity: "info",
          });
          setupMint = await createAccountsForMint(
            candyMachine,
            wallet.publicKey
          );
          let status: any = { err: true };
          if (setupMint.transaction) {
            status = await awaitTransactionSignatureConfirmation(
              setupMint.transaction,
              props.txTimeout,
              props.connection,
              true
            );
          }
          if (status && !status.err) {
            setSetupTxn(setupMint);
            setAlertState({
              open: true,
              message:
                "Setup transaction succeeded! Please sign minting transaction",
              severity: "info",
            });
          } else {
            setAlertState({
              open: true,
              message: "Mint failed! Please try again!",
              severity: "error",
            });
            setIsUserMinting(false);
            return;
          }
        } else {
          setAlertState({
            open: true,
            message: "Please sign minting transaction",
            severity: "info",
          });
        }

        const quantity = Number(mintCount);
        let mintResult = await mintMultipleToken(
          candyMachine,
          wallet.publicKey,
          quantity,
          beforeTransactions,
          afterTransactions,
          setupMint ?? setupTxn
        );

        let status: any = { err: true };
        let metadataStatus = null;
        //console.log(mintResult);
        if (mintResult) {
          status = await awaitTransactionSignatureConfirmation(
            mintResult.mintTxId,
            props.txTimeout,
            props.connection,
            true
          );

          metadataStatus =
            await candyMachine.program.provider.connection.getAccountInfo(
              mintResult.metadataKey,
              "processed"
            );
          console.log("Metadata status: ", !!metadataStatus);
        }

        if (status && !status.err && metadataStatus) {
          // manual update since the refresh might not detect
          // the change immediately
          let remaining = itemsRemaining! - 1;
          setItemsRemaining(remaining);
          setIsActive((candyMachine.state.isActive = remaining > 0));
          candyMachine.state.isSoldOut = remaining === 0;
          setSetupTxn(undefined);
          await refreshCandyMachineState("processed");
          await sleep(15000);
          await collectNftsFromWallet();
          throwConfetti();

          /*           setAlertState({
            open: true,
            message: "Congratulations! Mint succeeded!",
            severity: "success",
            hideDuration: 7000,
          }); */
        } else if (status && !status.err) {
          setAlertState({
            open: true,
            message:
              "Mint likely failed! Anti-bot SOL 0.01 fee potentially charged! Check the explorer to confirm the mint failed and if so, make sure you are eligible to mint before trying again.",
            severity: "error",
            hideDuration: 8000,
          });
          refreshCandyMachineState();
        } else {
          setAlertState({
            open: true,
            message: "Mint failed! Please try again!",
            severity: "error",
          });
          refreshCandyMachineState();
        }
      }
    } catch (error: any) {
      let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (!error.message) {
          message = "Transaction timeout! Please try again.";
        } else if (error.message.indexOf("0x137")) {
          console.log(error);
          message = `SOLD OUT!`;
        } else if (error.message.indexOf("0x135")) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          console.log(error);
          message = `SOLD OUT!`;
          window.location.reload();
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: "error",
      });
      // updates the candy machine state to reflect the latest
      // information on chain
      refreshCandyMachineState();
    } finally {
      setIsUserMinting(false);
    }
  };
  const toggleMintButton = () => {
    let active = !isActive || isPresale;

    if (active) {
      /*       if (candyMachine!.state.isWhitelistOnly && !isWhitelistUser) {
        active = false;
      } */
      if (endDate && Date.now() >= endDate.getTime()) {
        active = false;
      }
    }

    /*     if (
      isPresale &&
      candyMachine!.state.goLiveDate &&
      candyMachine!.state.goLiveDate.toNumber() <= new Date().getTime() / 1000
    ) {
      setIsPresale((candyMachine!.state.isPresale = false));
    } */

    setIsActive((candyMachine!.state.isActive = active));
  };

  const [open, setOpen] = useState(false);
  const [currentNFT, setCurrentNFT] = useState<any>();

  /*const handleClose = () => {
    setOpen(false);
  };
   function displayRarity(nft: any) {
    setOpen(true);
    setCurrentNFT(nft);
  } */

  useEffect(() => {
    (async () => {
      await refreshCandyMachineState();
      console.log("useEffect anchorwallet: ", anchorWallet);
      if (anchorWallet) {
        await collectNftsFromWallet();
      }
    })();
  }, [
    anchorWallet,
    refreshCandyMachineState,
    props.candyMachineId,
    props.connection,
    balance,
  ]);

  useEffect(() => {
    (async () => {
      if (wallet?.publicKey) {
        const balance = await props.connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
    })();
  }, [wallet, props.connection]);

  return (
    <>
      {/* <Dialog open={open} onClose={handleClose}>
        <Paper>
          <img src={currentNFT?.image} height="500px" width="500px" />
        </Paper>
      </Dialog> */}
      <Container>
        <Backdrop
          open={loading}
          style={{ position: "absolute", height: "100%", zIndex: "4" }}
        >
          <CircularProgress color="inherit" />
        </Backdrop>
        <Container maxWidth="xs" style={{ position: "relative" }}>
          {wallet.connected && (
            <>
              <Paper
                style={{
                  padding: 24,
                  backgroundColor: "#151a1fa5",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "20px",
                }}
              >
                <WalletMultiButton />
                <Typography variant="body2" style={{ marginLeft: "20px" }}>
                  BALANCE: <b>{balance.toFixed(5)}</b> SOL
                </Typography>
              </Paper>
              <Paper
                style={{
                  width: "100%",
                  paddingTop: "20px",
                  paddingBottom: "10px",
                  marginBottom: "20px",
                  backgroundColor: "#151a1fa5",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <Typography
                  variant="body2"
                  style={{
                    textAlign: "center",
                    marginBottom: "20px",
                  }}
                >
                  MY NFTS FROM THE COLLECTION ({" "}
                  {nftsMintedByOwner ? nftsMintedByOwner.length : 0} PCS )
                </Typography>
                <Container
                  style={{
                    width: "100%",
                    maxHeight: "400px",
                  }}
                >
                  <>
                    <Swiper
                      slidesPerView={1}
                      spaceBetween={30}
                      loop={true}
                      pagination={{
                        clickable: true,
                      }}
                      navigation={true}
                      modules={[Pagination, Navigation]}
                      className="mySwiper"
                    >
                      {nftsMintedByOwner.map((nft: any) => (
                        <SwiperSlide key={nft.image}>
                          <Box className="imageContainer">
                            <img
                              src={nft.image}
                              width="70%"
                              height="auto"
                              loading="lazy"
                              style={{
                                borderRadius: "20px",
                                display: "block",
                              }}
                            />
                            <Paper className="rarity">
                              <Box
                                style={{
                                  padding: "20px 30px 20px 30px",
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "space-between",
                                  width: "100%",
                                }}
                              >
                                <Typography
                                  style={{
                                    textTransform: "uppercase",
                                    marginBottom: "10px",
                                    borderBottom: "1px solid whitesmoke",
                                  }}
                                  variant="h6"
                                  color="textPrimary"
                                >
                                  {nft.rarity.category}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="textSecondary"
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  BACKGROUND:
                                  <b
                                    style={{
                                      fontSize: "1.2rem",
                                      color: "white",
                                    }}
                                  >
                                    {nft.rarity.scores["Background"]} / 2
                                  </b>
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="textSecondary"
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  HEADSCARF:{" "}
                                  <b
                                    style={{
                                      fontSize: "1.2rem",
                                      color: "white",
                                    }}
                                  >
                                    {nft.rarity.scores["Headscarf"]} / 3
                                  </b>
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="textSecondary"
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  GLASSES:{" "}
                                  <b
                                    style={{
                                      fontSize: "1.2rem",
                                      color: "white",
                                    }}
                                  >
                                    {nft.rarity.scores["Glasses"]} / 3
                                  </b>
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="textSecondary"
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  MONKEY:{" "}
                                  <b
                                    style={{
                                      fontSize: "1.2rem",
                                      color: "white",
                                    }}
                                  >
                                    {nft.rarity.scores["Monkeys"]} / 2
                                  </b>
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="textSecondary"
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  PARROT:{" "}
                                  <b
                                    style={{
                                      fontSize: "1.2rem",
                                      color: "white",
                                    }}
                                  >
                                    {nft.rarity.scores["Parrots"]} / 3
                                  </b>
                                </Typography>
                              </Box>
                            </Paper>
                          </Box>
                        </SwiperSlide>
                      ))}
                    </Swiper>
                  </>
                </Container>
              </Paper>
            </>
          )}
          <Paper
            style={{
              padding: 20,
              paddingBottom: 20,
              backgroundColor: "#151a1fa5",
              borderRadius: 6,
            }}
          >
            {!wallet.connected ? (
              <ConnectButton>Connect Wallet</ConnectButton>
            ) : (
              <>
                {candyMachine && (
                  <>
                    <Grid
                      container
                      direction="row"
                      justifyContent="center"
                      wrap="nowrap"
                    >
                      {!candyMachine?.state?.isSoldOut && isActive && (
                        <Grid item xs={4}>
                          <Typography variant="body2" color="textSecondary">
                            {isWhitelistUser && discountPrice
                              ? "Discount Price"
                              : "*Price"}
                          </Typography>
                          <Typography
                            variant="h6"
                            color="textPrimary"
                            style={{ fontWeight: "bold" }}
                          >
                            {isWhitelistUser && discountPrice
                              ? `◎ ${formatNumber.asNumber(discountPrice)}`
                              : `◎ ${totalCost}`}
                          </Typography>
                        </Grid>
                      )}
                      {isActive && (
                        <Grid item xs={4}>
                          <Typography variant="body2" color="textSecondary">
                            Remaining
                          </Typography>
                          <Typography
                            variant="h6"
                            color="textPrimary"
                            style={{
                              fontWeight: "bold",
                            }}
                          >
                            {`${itemsRemaining}`} /{" "}
                            {candyMachine.state.itemsAvailable}
                          </Typography>
                        </Grid>
                      )}
                      <Grid item xs={4}>
                        {isActive &&
                        endDate &&
                        Date.now() < endDate.getTime() ? (
                          <>
                            <MintCountdown
                              key="endSettings"
                              date={getCountdownDate(
                                candyMachine,
                                currentShift
                              )}
                              style={{ justifyContent: "flex-end" }}
                              status="COMPLETED"
                              onComplete={toggleMintButton}
                            />
                            <Typography
                              variant="caption"
                              align="center"
                              display="block"
                              style={{ fontWeight: "bold" }}
                            >
                              TO END OF MINT
                            </Typography>
                          </>
                        ) : (
                          <>
                            <MintCountdown
                              key="goLive"
                              date={getCountdownDate(
                                candyMachine,
                                currentShift
                              )}
                              style={{ justifyContent: "flex-end" }}
                              status={
                                candyMachine?.state?.isSoldOut ||
                                (endDate && Date.now() > endDate.getTime())
                                  ? "COMPLETED"
                                  : isPresale
                                  ? "PRESALE"
                                  : "LIVE"
                              }
                              onComplete={toggleMintButton}
                            />
                            {isPresale &&
                              candyMachine.state.goLiveDate &&
                              candyMachine.state.goLiveDate.toNumber() >
                                new Date().getTime() / 1000 && (
                                <Typography
                                  variant="caption"
                                  align="center"
                                  display="block"
                                  style={{ fontWeight: "bold" }}
                                >
                                  UNTIL PUBLIC MINT
                                </Typography>
                              )}
                          </>
                        )}
                      </Grid>
                    </Grid>
                    {!candyMachine?.state?.isSoldOut && isActive && (
                      <Grid container>
                        <Grid item xs={12}>
                          <Typography
                            variant="caption"
                            style={{ color: "grey" }}
                          >
                            {"*Estimated total cost - fees included"}
                          </Typography>
                        </Grid>
                      </Grid>
                    )}
                  </>
                )}
                <Grid container spacing={5}>
                  {!candyMachine?.state?.isSoldOut && isActive ? (
                    <>
                      <Grid item xs={5}>
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          style={{ paddingBottom: "5px" }}
                        >
                          {"Amount"}
                        </Typography>
                        <NFTcounter
                          remainingNFTs={itemsRemaining!}
                          price={price}
                          setMintCount={setMintCount}
                          setTotalCost={setTotalCost}
                        />
                      </Grid>
                      <Grid item xs={7}>
                        <MintContainer>
                          {candyMachine?.state.isActive &&
                          candyMachine?.state.gatekeeper &&
                          wallet.publicKey &&
                          wallet.signTransaction ? (
                            <GatewayProvider
                              wallet={{
                                publicKey:
                                  wallet.publicKey ||
                                  new PublicKey(CANDY_MACHINE_PROGRAM),
                                //@ts-ignore
                                signTransaction: wallet.signTransaction,
                              }}
                              gatekeeperNetwork={
                                candyMachine?.state?.gatekeeper
                                  ?.gatekeeperNetwork
                              }
                              clusterUrl={rpcUrl}
                              //cluster={cluster}
                              handleTransaction={async (
                                transaction: Transaction
                              ) => {
                                setIsUserMinting(true);
                                const userMustSign =
                                  transaction.signatures.find((sig) =>
                                    sig.publicKey.equals(wallet.publicKey!)
                                  );
                                if (userMustSign) {
                                  setAlertState({
                                    open: true,
                                    message:
                                      "Please sign one-time Civic Pass issuance",
                                    severity: "info",
                                  });
                                  try {
                                    transaction = await wallet.signTransaction!(
                                      transaction
                                    );
                                  } catch (e) {
                                    setAlertState({
                                      open: true,
                                      message: "User cancelled signing",
                                      severity: "error",
                                    });
                                    // setTimeout(() => window.location.reload(), 2000);
                                    setIsUserMinting(false);
                                    throw e;
                                  }
                                } else {
                                  setAlertState({
                                    open: true,
                                    message: "Refreshing Civic Pass",
                                    severity: "info",
                                  });
                                }
                                try {
                                  await sendTransaction(
                                    props.connection,
                                    wallet,
                                    transaction,
                                    [],
                                    true,
                                    "confirmed"
                                  );
                                  setAlertState({
                                    open: true,
                                    message: "Please sign minting",
                                    severity: "info",
                                  });
                                } catch (e) {
                                  setAlertState({
                                    open: true,
                                    message:
                                      "Solana dropped the transaction, please try again",
                                    severity: "warning",
                                  });
                                  console.error(e);
                                  // setTimeout(() => window.location.reload(), 2000);
                                  setIsUserMinting(false);
                                  throw e;
                                }
                                await onMint();
                              }}
                              broadcastTransaction={false}
                              options={{ autoShowModal: false }}
                            >
                              <MintButton
                                candyMachine={candyMachine}
                                isMinting={isUserMinting}
                                setIsMinting={(val) => setIsUserMinting(val)}
                                onMint={onMint}
                                isActive={
                                  isActive ||
                                  (isPresale &&
                                    isWhitelistUser &&
                                    isValidBalance)
                                }
                              />
                            </GatewayProvider>
                          ) : (
                            <MintButton
                              candyMachine={candyMachine}
                              isMinting={isUserMinting}
                              setIsMinting={(val) => setIsUserMinting(val)}
                              onMint={onMint}
                              isActive={
                                isActive || (isPresale && isWhitelistUser)
                              }
                            />
                          )}
                        </MintContainer>
                      </Grid>
                    </>
                  ) : (
                    <Grid item xs={12}>
                      <MintContainer>
                        {candyMachine?.state.isActive &&
                        candyMachine?.state.gatekeeper &&
                        wallet.publicKey &&
                        wallet.signTransaction ? (
                          <GatewayProvider
                            wallet={{
                              publicKey:
                                wallet.publicKey ||
                                new PublicKey(CANDY_MACHINE_PROGRAM),
                              //@ts-ignore
                              signTransaction: wallet.signTransaction,
                            }}
                            // // Replace with following when added
                            // gatekeeperNetwork={candyMachine.state.gatekeeper_network}
                            gatekeeperNetwork={
                              candyMachine?.state?.gatekeeper?.gatekeeperNetwork
                            } // This is the ignite (captcha) network
                            /// Don't need this for mainnet
                            clusterUrl={rpcUrl}
                            options={{ autoShowModal: false }}
                          >
                            <MintButton
                              candyMachine={candyMachine}
                              isMinting={isUserMinting}
                              setIsMinting={(val) => setIsUserMinting(val)}
                              onMint={onMint}
                              isActive={
                                isActive || (isPresale && isWhitelistUser)
                              }
                            />
                          </GatewayProvider>
                        ) : (
                          <MintButton
                            candyMachine={candyMachine}
                            isMinting={isUserMinting}
                            setIsMinting={(val) => setIsUserMinting(val)}
                            onMint={onMint}
                            isActive={
                              isActive || (isPresale && isWhitelistUser)
                            }
                          />
                        )}
                      </MintContainer>
                    </Grid>
                  )}
                </Grid>
              </>
            )}
            {/* <Typography
            variant="caption"
            align="center"
            display="block"
            style={{ marginTop: 7, color: "grey" }}
          >
            Powered by METAPLEX
          </Typography> */}
          </Paper>
        </Container>

        <Snackbar
          open={alertState.open}
          autoHideDuration={6000}
          onClose={() => setAlertState({ ...alertState, open: false })}
        >
          <Alert
            onClose={() => setAlertState({ ...alertState, open: false })}
            severity={alertState.severity}
          >
            {alertState.message}
          </Alert>
        </Snackbar>
      </Container>
    </>
  );
};

const getCountdownDate = (
  candyMachine: CandyMachineAccount,
  currentShift: number
): Date | undefined => {
  if (
    candyMachine.state.isActive &&
    candyMachine.state.endSettings?.endSettingType.date
  ) {
    return toDate(candyMachine.state.endSettings.number);
  }

  return toDate(
    candyMachine.state.goLiveDate
      ? new anchor.BN(candyMachine.state.goLiveDate.toNumber() + currentShift)
      : candyMachine.state.isPresale
      ? new anchor.BN(new Date().getTime() / 1000)
      : undefined
  );
};

export default Home;
