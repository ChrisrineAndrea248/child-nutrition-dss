#!/usr/bin/env python3
"""
Nutrition DSS Prediction Script
Loads saved XGBoost models and generates predictions for stunting and underweight.
Reads JSON from stdin, writes JSON to stdout.
"""

import json
import sys
import os
import pickle
import warnings

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

# Model paths
MODELS_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "CAR_MICS6_Undernutrition",
    "CAR_MICS6_Undernutrition",
    "notebooks",
    "final_models",
)

STUNTING_MODEL_PATH = os.path.join(MODELS_DIR, "final_stunting_model.pkl")
UNDERWEIGHT_MODEL_PATH = os.path.join(MODELS_DIR, "final_underweight_model.pkl")

STUNTING_THRESHOLD = 0.53
UNDERWEIGHT_THRESHOLD = 0.51

NUMERIC_PREDICTORS = ["CAGE", "WB4", "WAGEM", "CEB", "CSURV", "CDEAD", "CM11"]

CATEGORICAL_PREDICTORS = [
    "HL4", "HH6", "windex5", "WS1", "WS11", "WS15",
    "welevel", "MSTATUS", "CM17", "insurance",
]

ALL_PREDICTORS = NUMERIC_PREDICTORS + CATEGORICAL_PREDICTORS


def load_model(path):
    with open(path, "rb") as f:
        return pickle.load(f)


def validate_input(data):
    errors = []
    for pred in ALL_PREDICTORS:
        if pred not in data:
            errors.append(f"Missing required predictor: {pred}")
    for pred in NUMERIC_PREDICTORS:
        if pred in data:
            val = data[pred]
            if val is None or (isinstance(val, str) and val.strip() == ""):
                errors.append(f"Numeric predictor '{pred}' cannot be empty")
            else:
                try:
                    float(val)
                except (ValueError, TypeError):
                    errors.append(f"Numeric predictor '{pred}' must be a number, got: {val}")
    return errors


def prepare_record(data):
    record = {}
    for pred in NUMERIC_PREDICTORS:
        val = data.get(pred)
        if val is None or (isinstance(val, str) and val.strip() == ""):
            record[pred] = None
        else:
            try:
                record[pred] = float(val)
            except (ValueError, TypeError):
                record[pred] = None
    for pred in CATEGORICAL_PREDICTORS:
        val = data.get(pred)
        if val is None or (isinstance(val, str) and val.strip() == ""):
            record[pred] = None
        else:
            record[pred] = str(val).strip()
    return record


def predict(models, record):
    import pandas as pd

    df = pd.DataFrame([record])

    for pred in NUMERIC_PREDICTORS:
        if pred in df.columns:
            df[pred] = pd.to_numeric(df[pred], errors="coerce")

    X = models["preprocessor"].transform(df)
    probability = float(models["model"].predict_proba(X)[:, 1][0])
    return probability


def get_feature_importance(model_bundle):
    import pandas as pd
    import numpy as np

    model = model_bundle["model"]
    preprocessor = model_bundle["preprocessor"]
    importances = model.feature_importances_
    feature_names = preprocessor.get_feature_names_out()

    grouped = {}
    for fname, imp in zip(feature_names, importances):
        parts = fname.split("__", 1)
        if len(parts) == 2:
            prefix, col = parts
            base_col = col.split("_")[0] if prefix == "categorical" else col
        else:
            base_col = fname

        if base_col not in grouped:
            grouped[base_col] = 0.0
        grouped[base_col] += float(imp)

    sorted_grouped = sorted(grouped.items(), key=lambda x: x[1], reverse=True)
    return [{"variable": v, "importance": round(i, 4)} for v, i in sorted_grouped]


def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        result = {"success": False, "error": f"Invalid JSON input: {str(e)}"}
        print(json.dumps(result))
        sys.exit(1)

    if "input" not in input_data:
        result = {"success": False, "error": "Missing 'input' key in request"}
        print(json.dumps(result))
        sys.exit(1)

    raw_input = input_data["input"]

    validation_errors = validate_input(raw_input)
    if validation_errors:
        result = {"success": False, "errors": validation_errors}
        print(json.dumps(result))
        sys.exit(1)

    try:
        stunting_model = load_model(STUNTING_MODEL_PATH)
        underweight_model = load_model(UNDERWEIGHT_MODEL_PATH)
    except Exception as e:
        result = {"success": False, "error": f"Failed to load models: {str(e)}"}
        print(json.dumps(result))
        sys.exit(1)

    record = prepare_record(raw_input)

    try:
        stunting_prob = predict(stunting_model, record)
        underweight_prob = predict(underweight_model, record)
    except Exception as e:
        result = {"success": False, "error": f"Prediction failed: {str(e)}"}
        print(json.dumps(result))
        sys.exit(1)

    stunting_positive = stunting_prob >= STUNTING_THRESHOLD
    underweight_positive = underweight_prob >= UNDERWEIGHT_THRESHOLD

    stunting_feature_importance = get_feature_importance(stunting_model)
    underweight_feature_importance = get_feature_importance(underweight_model)

    result = {
        "success": True,
        "predictions": {
            "stunting": {
                "probability": round(stunting_prob, 4),
                "threshold": STUNTING_THRESHOLD,
                "positive": stunting_positive,
                "classification": "Elevated Risk" if stunting_positive else "Normal Range",
                "interpretation": (
                    "Model indicates elevated likelihood of stunting."
                    if stunting_positive
                    else "Model indicates normal growth pattern for height-for-age."
                ),
            },
            "underweight": {
                "probability": round(underweight_prob, 4),
                "threshold": UNDERWEIGHT_THRESHOLD,
                "positive": underweight_positive,
                "classification": "Elevated Risk" if underweight_positive else "Normal Range",
                "interpretation": (
                    "Model indicates elevated likelihood of being underweight."
                    if underweight_positive
                    else "Model indicates normal weight-for-age pattern."
                ),
            },
        },
        "model_info": {
            "data_source": "CAR MICS6",
            "country": "Central African Republic",
            "algorithm": "XGBoost",
            "outcomes": ["Stunting", "Underweight"],
            "purpose": "Child undernutrition screening / decision support",
            "stunting_threshold": STUNTING_THRESHOLD,
            "underweight_threshold": UNDERWEIGHT_THRESHOLD,
        },
        "feature_importance": {
            "stunting": stunting_feature_importance,
            "underweight": underweight_feature_importance,
        },
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
