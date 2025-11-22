"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { trpc } from "@/lib/trpc/client";
import { isValidCardNumber as isValidCardNumberUtil, getCardType } from "@/server/utils/payment";

interface FundingModalProps {
  accountId: number;
  onClose: () => void;
  onSuccess: () => void;
}

type FundingFormData = {
  amount: string;
  fundingType: "card" | "bank";
  accountNumber: string;
  routingNumber?: string;
};

export function FundingModal({ accountId, onClose, onSuccess }: FundingModalProps) {
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FundingFormData>({
    defaultValues: {
      fundingType: "card",
    },
  });

  const fundingType = watch("fundingType");
    const accountNumberValue = watch("accountNumber");
    const detectedCardType = fundingType === "card" && accountNumberValue ? getCardType(accountNumberValue) : null;
  const utils = trpc.useContext();
  const fundAccountMutation = trpc.account.fundAccount.useMutation();

  const onSubmit = async (data: FundingFormData) => {
    setError("");

    try {
      const amount = parseFloat(data.amount);

      await fundAccountMutation.mutateAsync({
        accountId,
        amount,
        fundingSource: {
          type: data.fundingType,
          accountNumber: data.accountNumber,
          routingNumber: data.routingNumber,
        },
      });

      // Invalidate the transactions list for this account so the UI shows all new transactions
      try {
        await utils.account.getTransactions.invalidate({ accountId });
      } catch (e) {
        // ignore invalidate errors; we'll still call onSuccess to refresh accounts
        console.warn('Failed to invalidate transactions cache', e);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to fund account");
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Fund Your Account</h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Amount</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                {...register("amount", {
                  required: "Amount is required",
                  validate: {
                    format: (v) => {
                      if (!v) return "Amount is required";
                      // Accept `0`, `0.5`, `0.50`, or integers without leading zeros like `1`, `10`, `10.23`
                      const re = /^(?:0|[1-9]\d*)(?:\.\d{0,2})?$/;
                      return re.test(v) || "Invalid amount format or multiple leading zeros";
                    },
                    min: (v) => {
                      const num = parseFloat(v || "0");
                      return num >= 0.01 || "Amount must be at least $0.01";
                    },
                    max: (v) => {
                      const num = parseFloat(v || "0");
                      return num <= 10000 || "Amount cannot exceed $10,000";
                    },
                  },
                })}
                type="text"
                className="pl-7 block w-full rounded-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2 border"
                placeholder="0.00"
              />
            </div>
            {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Funding Source</label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input {...register("fundingType")} type="radio" value="card" className="mr-2" />
                <span>Credit/Debit Card</span>
              </label>
              <label className="flex items-center">
                <input {...register("fundingType")} type="radio" value="bank" className="mr-2" />
                <span>Bank Account</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {fundingType === "card" ? "Card Number" : "Account Number"}
            </label>
            <input
              {...register("accountNumber", {
                required: `${fundingType === "card" ? "Card" : "Account"} number is required`,
                validate: {
                  bankPattern: (value) => {
                    if (fundingType === "card") return true;
                    return /^\d+$/.test(value) || "Invalid account number";
                  },
                  validCard: (value) => {
                    if (fundingType !== "card") return true;
                    return isValidCardNumberUtil(value) || "Invalid card number";
                  },
                },
              })}
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              placeholder={fundingType === "card" ? "1234567812345678" : "123456789"}
            />
            {errors.accountNumber && <p className="mt-1 text-sm text-red-600">{errors.accountNumber.message}</p>}
            {fundingType === "card" && accountNumberValue && (
              <p className="mt-1 text-sm text-gray-500">Detected card type: {detectedCardType || "unknown"}</p>
            )}
          </div>

          {fundingType === "bank" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Routing Number</label>
              <input
                {...register("routingNumber", {
                  required: "Routing number is required",
                  pattern: {
                    value: /^\d{9}$/,
                    message: "Routing number must be 9 digits",
                  },
                })}
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                placeholder="123456789"
              />
              {errors.routingNumber && <p className="mt-1 text-sm text-red-600">{errors.routingNumber.message}</p>}
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={fundAccountMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {fundAccountMutation.isPending ? "Processing..." : "Fund Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
