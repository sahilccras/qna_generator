# backend/storage.py
import os
import pandas as pd
import threading
from typing import List, Dict, Any

class CSVStorage:
    def __init__(self, csv_path: str):
        self.csv_path = csv_path
        self.lock = threading.Lock()
        self._reload()

    def _reload(self):
        if os.path.exists(self.csv_path):
            self.df = pd.read_csv(self.csv_path, encoding='utf-8-sig').fillna("")
        else:
            self.df = pd.DataFrame()

    def reload(self):
        with self.lock:
            self._reload()

    def headers_for_qa_count(self, n: int) -> List[str]:
        headers = ['sanskrit', 'english', 'tags']
        for lang in ['en', 'hi', 'sa']:
            for i in range(1, n + 1):
                headers.append(f'q_{lang}_{i}')
                headers.append(f'a_{lang}_{i}')
        return headers

    def row_count(self) -> int:
        return len(self.df)

    def list_rows(self, skip: int = 0, limit: int = 100, q: str = '') -> List[Dict[str, Any]]:
        df = self.df
        if q:
            mask = (
                df['sanskrit'].astype(str).str.contains(q, na=False) |
                df['english'].astype(str).str.contains(q, na=False)
            )
            if 'tags' in df.columns:
                mask |= df['tags'].astype(str).str.contains(q, na=False)
            df = df[mask]

        out = []
        for i, r in df.iloc[skip: skip + limit].iterrows():
            out.append({
                'id': int(i),
                'sanskrit': str(r.get('sanskrit', ''))[:120],
                'english': str(r.get('english', ''))[:240],
                'tags': r.get('tags', ''),
            })
        return out

    def list_all_rows(self) -> List[Dict[str, Any]]:
        return self.df.to_dict(orient='records')

    def get_row(self, idx:int) -> Dict[str,Any]:
        if idx < 0 or idx >= len(self.df):
            return None
        
        r = self.df.iloc[idx].to_dict()
        r['id'] = int(idx)
        
        for key, value in r.items():
            if pd.isna(value):
                r[key] = ""
            elif isinstance(value, float) and pd.isna(value):
                r[key] = ""
                
        return r

    def update_row_with_qas(self, idx: int, payload: Dict[str, Any]) -> bool:
        with self.lock:
            if idx < 0 or idx >= len(self.df):
                return False

            if 'tags' in payload:
                if 'tags' not in self.df.columns:
                    self.df['tags'] = ""
                self.df.at[idx, 'tags'] = payload['tags']

            existing_qas = self.count_existing_qas(idx)
            qa_keys = [k for k in payload.keys() if k.startswith(('q_', 'a_'))]
            for key in qa_keys:
                if isinstance(payload[key], list):
                    for i, item in enumerate(payload[key], start=1):
                        col_name = f"{key}_{existing_qas + i}"
                        if col_name not in self.df.columns:
                            self.df[col_name] = ""
                        self.df.at[idx, col_name] = str(item) if item is not None else ""

            self.df = self.df.fillna("")

            tmp = self.csv_path + ".tmp"
            self.df.to_csv(tmp, index=False, encoding='utf-8-sig')
            os.replace(tmp, self.csv_path)
            return True

    def ensure_headers(self, count: int):
        with self.lock:
            headers = self.headers_for_qa_count(count)
            for header in headers:
                if header not in self.df.columns:
                    self.df[header] = ""

            tmp = self.csv_path + ".tmp"
            self.df.to_csv(tmp, index=False, encoding='utf-8-sig')
            os.replace(tmp, self.csv_path)

    def has_existing_qa_data(self, idx: int) -> bool:
        if idx < 0 or idx >= len(self.df):
            return False
        
        row = self.df.iloc[idx]
        qa_columns = [col for col in self.df.columns if col.startswith(('q_en_', 'q_hi_', 'q_sa_'))]
        
        for col in qa_columns:
            if col in row and pd.notna(row[col]) and str(row[col]).strip():
                return True
        
        return False

    def count_existing_qas(self, idx: int) -> int:
        if idx < 0 or idx >= len(self.df):
            return 0

        row = self.df.iloc[idx]
        max_q_num = 0
        # Check all q_ columns, not just q_en
        for col in self.df.columns:
            if col.startswith('q_') and pd.notna(row.get(col)) and str(row.get(col)).strip():
                try:
                    num = int(col.split('_')[-1])
                    if num > max_q_num:
                        max_q_num = num
                except (ValueError, IndexError):
                    continue
        return max_q_num

class CSVManager:
    def __init__(self, data_folder: str):
        self.data_folder = data_folder
        self.storages: Dict[str, CSVStorage] = {}
        self._discover_csvs()

    def _discover_csvs(self):
        os.makedirs(self.data_folder, exist_ok=True)
        for filename in os.listdir(self.data_folder):
            if filename.endswith(".csv"):
                self.get_storage(filename)

    def get_storage(self, filename: str) -> CSVStorage:
        if filename not in self.storages:
            path = os.path.join(self.data_folder, filename)
            self.storages[filename] = CSVStorage(path)
        return self.storages[filename]

    def add_csv(self, filename: str, df: pd.DataFrame):
        path = os.path.join(self.data_folder, filename)
        df.to_csv(path, index=False, encoding='utf-8-sig')
        self.get_storage(filename) # This will create and load the new storage instance

    def list_csvs(self) -> List[str]:
        return sorted(self.storages.keys())
