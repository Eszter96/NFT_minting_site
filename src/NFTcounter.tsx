import styled from "styled-components";
import { useEffect, useState } from "react";
import Grid from "@material-ui/core/Grid";
export const Minus = styled.button`
  width: 35px;
  height: 35px;
  font-size: 1.3em;
  font-weight: bold;
  line-height: 0.5px;
  color: var(--main-text-color);
  background: linear-gradient(#7fff2f 0%, #2fb62f 100%);
  border: 0;
  border-radius: 50%;
  vertical-align: middle;
  opacity: 1;
  -moz-transition: all 0.2s ease-in-out;
  -webkit-transition: all 0.2s ease-in-out;
  -ms-transition: all 0.2s ease-in-out;
  -o-transition: all 0.2s ease-in-out;
  transition: all 0.2s ease-in-out;
  :hover {
    opacity: 0.8;
  }

  :not(disabled) {
    cursor: pointer;
  }
`;

export const Plus = styled(Minus)`
  margin-left: 0;
`;

export const NumericField = styled.input`
  -moz-appearance: textfield;
  font-size: 1.3em !important;
  padding: 4px;
  max-width: 100%;
  text-align: center;
  color: var(--main-text-color);
  background-color: var(--main-text-color);
  line-height: 1;
  border-radius: 8px;
  border: none;
  transition: all 0.4s ease;
  :hover,
  :focus {
    box-shadow: 0px 3px 5px -1px rgb(0 0 0 / 40%),
      0px 6px 10px 0px rgb(0 0 0 / 34%), 0px 1px 18px 0px rgb(0 0 0 / 32%);
  }
  ::-webkit-outer-spin-button,
  ::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }
`;

export const NFTcounter = ({
  remainingNFTs,
  setTotalCost,
  setMintCount,
  price,
}: {
  remainingNFTs: number;
  setTotalCost: any;
  setMintCount: any;
  price: number;
}) => {
  const [mintCount, setCount] = useState(1);

  function incrementValue() {
    var numericField = document.querySelector(".mint-qty") as HTMLInputElement;
    if (numericField) {
      var value = parseInt(numericField.value);
      if (!isNaN(value) && value < remainingNFTs) {
        value++;
        numericField.value = "" + value;
        updateAmounts(value);
      }
    }
  }

  function decrementValue() {
    var numericField = document.querySelector(".mint-qty") as HTMLInputElement;
    if (numericField) {
      var value = parseInt(numericField.value);
      if (!isNaN(value) && value > 1) {
        value--;
        numericField.value = "" + value;
        updateAmounts(value);
      }
    }
  }

  function updateMintCount(target: any) {
    var value = parseInt(target.value);
    if (!isNaN(value)) {
      if (value > remainingNFTs) {
        value = remainingNFTs;
        target.value = "" + value;
      } else if (value < 1) {
        value = 1;
        target.value = "" + value;
      }
      updateAmounts(value);
    }
  }

  function updateAmounts(qty: number) {
    setCount(qty);
    setMintCount(qty);
    setTotalCost(Math.round(qty * (price + 0.012) * 1000) / 1000); // 0.012 = approx of account creation fees
  }

  return (
    <Grid container spacing={1}>
      <Grid item xs={4} style={{ display: "flex", justifyContent: "center" }}>
        <Minus onClick={() => decrementValue()}>-</Minus>
      </Grid>
      <Grid item xs={4} style={{ display: "flex", justifyContent: "center" }}>
        <NumericField
          type="number"
          className="mint-qty"
          step={1}
          min={1}
          max={10}
          value={mintCount}
          onChange={(e) => updateMintCount(e.target as any)}
        />
      </Grid>
      <Grid item xs={4} style={{ display: "flex", justifyContent: "center" }}>
        <Plus onClick={() => incrementValue()}>+</Plus>
      </Grid>
    </Grid>
  );
};
