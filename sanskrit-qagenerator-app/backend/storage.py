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
        
        # Clean NaN values from the row data
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

            # Clear old Q&A data
            qa_columns = [col for col in self.df.columns if col.startswith(('q_', 'a_'))]
            for col in qa_columns:
                self.df.at[idx, col] = ""

            # Update tags
            if 'tags' in payload:
                if 'tags' not in self.df.columns:
                    self.df['tags'] = ""
                self.df.at[idx, 'tags'] = payload['tags']

            # Update Q&A pairs
            qa_keys = [k for k in payload.keys() if k.startswith(('q_', 'a_'))]
            for key in qa_keys:
                if isinstance(payload[key], list):
                    for i, item in enumerate(payload[key], start=1):
                        col_name = f"{key}_{i}"
                        if col_name not in self.df.columns:
                            self.df[col_name] = ""
                        self.df.at[idx, col_name] = str(item) if item is not None else ""

            # Ensure no NaN values before saving
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
        """Check if a row already has Q&A data"""
        if idx < 0 or idx >= len(self.df):
            return False
        
        row = self.df.iloc[idx]
        # Check if any Q&A columns have data
        qa_columns = [col for col in self.df.columns if col.startswith(('q_en_', 'q_hi_', 'q_sa_'))]
        
        for col in qa_columns:
            if col in row and pd.notna(row[col]) and str(row[col]).strip():
                return True
        
        return False
