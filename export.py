import pandas as pd

df = pd.read_excel("/mnt/data/databasestockisa.xlsx")
print("Colonnes du fichier :", df.columns.tolist())
print("Premières lignes :", df.head())