import { useEffect, useMemo, useState, useCallback } from "react";
import * as anchor from "@project-serum/anchor";
import { WalletMultiButton } from "@solana/wallet-adapter-material-ui";
import styled from "styled-components";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Container, DialogContent, Grow, Snackbar } from "@material-ui/core";
import Paper from "@material-ui/core/Paper";
import Alert from "@material-ui/lab/Alert";
import Grid from "@material-ui/core/Grid";
import Box from "@material-ui/core/Box";
import Dialog from "@material-ui/core/Dialog";
import { DialogTitle } from "@material-ui/core";
import Backdrop from "@material-ui/core/Backdrop";
import CircularProgress from "@material-ui/core/CircularProgress";
import Typography from "@material-ui/core/Typography";
import { Connection, programs } from "@metaplex/js";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletDialogButton } from "@solana/wallet-adapter-material-ui";
import {
  awaitTransactionSignatureConfirmation,
  CandyMachineAccount,
  CANDY_MACHINE_PROGRAM,
  getCandyMachineState,
  mintOneToken,
  mintMultipleToken,
} from "./candy-machine";
import { AlertState, toDate, formatNumber, getAtaForMint } from "./utils";
import ImageList from "@material-ui/core/ImageList";
import ImageListItem from "@material-ui/core/ImageListItem";
import { MintCountdown } from "./MintCountdown";
import { MintButton } from "./MintButton";
import { GatewayProvider } from "@civic/solana-gateway-react";
import { sendTransaction } from "./connection";
import { NFTcounter } from "./NFTcounter";

import { Swiper, SwiperSlide } from "swiper/react/swiper-react";
import "swiper/swiper.min.css";
import "swiper/modules/pagination/pagination.min.css";
import "swiper/swiper-bundle.min.css";
import "swiper/swiper-bundle.css";
import "swiper/swiper.scss";

import { Pagination, Navigation } from "swiper";
import "./Home.css";
import { getDerivationPath } from "@solana/wallet-adapter-ledger";
import { async } from "q";
import axios from "axios";
import { upperCase } from "lodash";
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
}

const Home = (props: HomeProps) => {
  const [nftsMintedByOwner, setNFTs] = useState<any>([]);
  const [isMinting, setIsMinting] = useState(false);
  const [mintCount, setMintCount] = useState(1);
  const [totalCost, setTotalCost] = useState(0);
  const [price, setPrice] = useState(0);
  const [balance, setBalance] = useState(0);
  const [isUserMinting, setIsUserMinting] = useState(false);
  const [candyMachine, setCandyMachine] = useState<CandyMachineAccount>();
  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });
  const [isActive, setIsActive] = useState(false);
  const [endDate, setEndDate] = useState<Date>();
  const [itemsRemaining, setItemsRemaining] = useState<number>();
  const [isWhitelistUser, setIsWhitelistUser] = useState(false);
  const [isPresale, setIsPresale] = useState(false);
  const [discountPrice, setDiscountPrice] = useState<anchor.BN>();
  const [loading, setLoading] = useState(false);
  const rpcUrl = props.rpcHost;
  const wallet = useWallet();

  const anchorWallet = useMemo(() => {
    if (
      !wallet ||
      !wallet.publicKey ||
      !wallet.signAllTransactions ||
      !wallet.signTransaction
    ) {
      return;
    }

    return {
      publicKey: wallet.publicKey,
      signAllTransactions: wallet.signAllTransactions,
      signTransaction: wallet.signTransaction,
    } as anchor.Wallet;
  }, [wallet]);

  const refreshCandyMachineState = useCallback(async () => {
    if (!anchorWallet) {
      return;
    }

    if (props.candyMachineId) {
      try {
        const cndy = await getCandyMachineState(
          anchorWallet,
          props.candyMachineId,
          props.connection
        );
        console.log(getCountdownDate(cndy));
        let active =
          cndy?.state.goLiveDate?.toNumber() < new Date().getTime() / 1000;
        let presale = false;
        let price = formatNumber.asNumber(cndy.state.price);
        setPrice(price!);
        let cost = mintCount * (price! + 0.012);
        setTotalCost(cost);
        // whitelist mint?
        if (cndy?.state.whitelistMintSettings) {
          // is it a presale mint?
          if (
            cndy.state.whitelistMintSettings.presale &&
            (!cndy.state.goLiveDate ||
              cndy.state.goLiveDate.toNumber() > new Date().getTime() / 1000)
          ) {
            presale = true;
          }
          // is there a discount?
          if (cndy.state.whitelistMintSettings.discountPrice) {
            setDiscountPrice(cndy.state.whitelistMintSettings.discountPrice);
          } else {
            setDiscountPrice(undefined);
            // when presale=false and discountPrice=null, mint is restricted
            // to whitelist users only
            if (!cndy.state.whitelistMintSettings.presale) {
              cndy.state.isWhitelistOnly = true;
            }
          }
          // retrieves the whitelist token
          const mint = new anchor.web3.PublicKey(
            cndy.state.whitelistMintSettings.mint
          );
          const token = (await getAtaForMint(mint, anchorWallet.publicKey))[0];

          try {
            const balance = await props.connection.getTokenAccountBalance(
              token
            );
            let valid = parseInt(balance.value.amount) > 0;
            // only whitelist the user if the balance > 0
            setIsWhitelistUser(valid);
            active = (presale && valid) || active;
          } catch (e) {
            setIsWhitelistUser(false);
            // no whitelist user, no mint
            if (cndy.state.isWhitelistOnly) {
              active = false;
            }
            console.log("There was a problem fetching whitelist token balance");
            console.log(e);
          }
        }
        // datetime to stop the mint?
        if (cndy?.state.endSettings?.endSettingType.date) {
          setEndDate(toDate(cndy.state.endSettings.number));
          if (
            cndy.state.endSettings.number.toNumber() <
            new Date().getTime() / 1000
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

        setIsActive((cndy.state.isActive = active));
        setIsPresale((cndy.state.isPresale = presale));
        setCandyMachine(cndy);
      } catch (e) {
        console.log("There was a problem fetching Candy Machine state");
        console.log(e);
      }
    }
    collectNftsFromWallet();
  }, [anchorWallet, props.candyMachineId, props.connection]);

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
    console.log(rarity);
    let image: string = response?.data.image;
    console.log(image);
    return { image, rarity };
  };

  const collectNftsFromWallet = async () => {
    const nftsmetadata = await Metadata.findDataByOwner(
      props.connection,
      anchorWallet!.publicKey
    );
    let NFTsfromCollection = Promise.all(
      nftsmetadata
        .filter(
          (nft) =>
            nft.data.name.includes("Treedom") && nft.data.symbol == "TDNFT"
        )
        .map((nftData) => getNFTs(nftData.data.uri))
    ).then((value) => {
      return value;
    });
    setNFTs(await NFTsfromCollection);
  };
  /* const onMint = async (
    beforeTransactions: Transaction[] = [],
    afterTransactions: Transaction[] = []
  ) => {
    try {
      setIsUserMinting(true);
      document.getElementById("#identity")?.click();
      if (wallet.connected && candyMachine?.program && wallet.publicKey) {
        let mintOne = await mintOneToken(
          candyMachine,
          wallet.publicKey,
          beforeTransactions,
          afterTransactions
        );
        console.log("mintone " + mintOne);
        const mintTxId = mintOne[0];

        let status: any = { err: true };
        if (mintTxId) {
          status = await awaitTransactionSignatureConfirmation(
            mintTxId,
            props.txTimeout,
            props.connection,
            true
          );
        }
        console.log(status);
        if (status && !status.err) {
          // manual update since the refresh might not detect
          // the change immediately
          let remaining = itemsRemaining! - 1;
          setItemsRemaining(remaining);
          setIsActive((candyMachine.state.isActive = remaining > 0));
          candyMachine.state.isSoldOut = remaining === 0;
          setAlertState({
            open: true,
            message: "Congratulations! Mint succeeded!",
            severity: "success",
          });
        } else {
          setAlertState({
            open: true,
            message: "Mint failed! Please try again!",
            severity: "error",
          });
        }
      }
    } catch (error: any) {
      console.log("ERROR");
      let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (!error.message) {
          message = "Transaction Timeout! Please try again.";
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
      // updates the candy machine state to reflect the lastest
      // information on chain
      refreshCandyMachineState();
    } finally {
      setIsUserMinting(false);
    }
  }; */

  async function refreshPage() {
    await refreshCandyMachineState();
    setLoading(true);
    await new Promise((f) => setTimeout(f, 10000));
    setLoading(false);
    window.location.reload();
  }

  function displaySuccess(mintPublicKey: any, qty: number = 1): void {
    let remaining = itemsRemaining! - 1;
    setItemsRemaining(remaining);
    setIsActive((candyMachine!.state.isActive = remaining > 0));
    candyMachine!.state.isSoldOut = remaining === 0;
    setAlertState({
      open: true,
      message: "Congratulations! Mint succeeded!",
      severity: "success",
    });

    refreshPage();
  }

  async function mintMany(quantityString: number) {
    if (wallet && candyMachine?.program && wallet.publicKey) {
      const quantity = Number(quantityString);
      const futureBalance = (balance || 0) - price * quantity;
      const signedTransactions: any = await mintMultipleToken(
        candyMachine,
        wallet.publicKey,
        quantity
      );

      const promiseArray = [];

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

      const allTransactionsResult = await Promise.all(promiseArray);
      let totalSuccess = 0;
      let totalFailure = 0;

      for (let index = 0; index < allTransactionsResult.length; index++) {
        const transactionStatus = allTransactionsResult[index];
        if (!transactionStatus?.err) {
          totalSuccess += 1;
        } else {
          totalFailure += 1;
        }
      }

      let retry = 0;
      if (allTransactionsResult.length > 0) {
        let newBalance =
          (await props.connection.getBalance(wallet.publicKey)) /
          LAMPORTS_PER_SOL;

        while (newBalance > futureBalance && retry < 20) {
          await new Promise((f) => setTimeout(f, 2000));
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

      setLoading(true);
      await new Promise((f) => setTimeout(f, 5000));
      setLoading(false);

      setAlertState({
        open: true,
        message: `Congratulations! Your ${quantity} mints succeeded!`,
        severity: "success",
      });
      refreshPage();
      /* 
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
      } */
    }
  }

  async function mintOne() {
    if (wallet && candyMachine?.program && wallet.publicKey) {
      const mint = anchor.web3.Keypair.generate();

      const mintTxId = (await mintOneToken(candyMachine, wallet.publicKey))[0];

      let status: any = { err: true };
      if (mintTxId) {
        status = await awaitTransactionSignatureConfirmation(
          mintTxId,
          props.txTimeout,
          props.connection,
          true
        );
      }

      if (!status?.err) {
        setAlertState({
          open: true,
          message: "Congratulations! Mint succeeded!",
          severity: "success",
        });
      }
      // update front-end amounts
      displaySuccess(mint.publicKey);
      /*       } else {
        setAlertState({
          open: true,
          message: "Mint failed! Please try again!",
          severity: "error",
        });
       */
    }
  }

  const startMint = async () => {
    try {
      setIsMinting(true);
      // if (mintCount === 1) {
      //   await mintOne();
      // } else {
      await mintMany(mintCount);
      // }
    } catch (error: any) {
      let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (!error.message) {
          message = "Transaction Timeout! Please try again.";
        } else if (error.message.indexOf("0x138")) {
        } else if (error.message.indexOf("0x137")) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf("0x135")) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: "error",
      });
    } finally {
      setIsMinting(false);
    }
  };

  const toggleMintButton = () => {
    let active = !isActive || isPresale;

    if (active) {
      if (candyMachine!.state.isWhitelistOnly && !isWhitelistUser) {
        active = false;
      }
      if (endDate && Date.now() >= endDate.getTime()) {
        active = false;
      }
    }

    if (
      isPresale &&
      candyMachine!.state.goLiveDate &&
      candyMachine!.state.goLiveDate.toNumber() <= new Date().getTime() / 1000
    ) {
      setIsPresale((candyMachine!.state.isPresale = false));
    }

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
    refreshCandyMachineState();
  }, [
    anchorWallet,
    props.candyMachineId,
    props.connection,
    refreshCandyMachineState,
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
                                  HEADSCAFT:{" "}
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
                              date={getCountdownDate(candyMachine)}
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
                              date={getCountdownDate(candyMachine)}
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
                                await startMint();
                              }}
                              broadcastTransaction={false}
                              options={{ autoShowModal: false }}
                            >
                              <MintButton
                                candyMachine={candyMachine}
                                isMinting={isUserMinting}
                                setIsMinting={(val) => setIsUserMinting(val)}
                                onMint={startMint}
                                isActive={
                                  isActive || (isPresale && isWhitelistUser)
                                }
                                rpcUrl={rpcUrl}
                              />
                            </GatewayProvider>
                          ) : (
                            <MintButton
                              candyMachine={candyMachine}
                              isMinting={isUserMinting}
                              setIsMinting={(val) => setIsUserMinting(val)}
                              onMint={startMint}
                              isActive={
                                isActive || (isPresale && isWhitelistUser)
                              }
                              rpcUrl={rpcUrl}
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
                            gatekeeperNetwork={
                              candyMachine?.state?.gatekeeper?.gatekeeperNetwork
                            }
                            clusterUrl={rpcUrl}
                            handleTransaction={async (
                              transaction: Transaction
                            ) => {
                              setIsUserMinting(true);
                              const userMustSign = transaction.signatures.find(
                                (sig) => sig.publicKey.equals(wallet.publicKey!)
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
                              await startMint();
                            }}
                            broadcastTransaction={false}
                            options={{ autoShowModal: false }}
                          >
                            <MintButton
                              candyMachine={candyMachine}
                              isMinting={isUserMinting}
                              setIsMinting={(val) => setIsUserMinting(val)}
                              onMint={startMint}
                              isActive={
                                isActive || (isPresale && isWhitelistUser)
                              }
                              rpcUrl={rpcUrl}
                            />
                          </GatewayProvider>
                        ) : (
                          <MintButton
                            candyMachine={candyMachine}
                            isMinting={isUserMinting}
                            setIsMinting={(val) => setIsUserMinting(val)}
                            onMint={startMint}
                            isActive={
                              isActive || (isPresale && isWhitelistUser)
                            }
                            rpcUrl={rpcUrl}
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
  candyMachine: CandyMachineAccount
): Date | undefined => {
  if (
    candyMachine.state.isActive &&
    candyMachine.state.endSettings?.endSettingType.date
  ) {
    return toDate(candyMachine.state.endSettings.number);
  }
  return toDate(
    candyMachine.state.goLiveDate
      ? candyMachine.state.goLiveDate
      : candyMachine.state.isPresale
      ? new anchor.BN(new Date().getTime() / 1000)
      : undefined
  );
};

export default Home;
