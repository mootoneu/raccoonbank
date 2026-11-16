import csv
import os
import re

def split_title_and_description(input_filepath, output_filepath):
    """
    Reads transactions, splits parenthetical text from the title into the description,
    and saves the results to a new CSV file.
    """
    try:
        with open(input_filepath, mode='r', newline='', encoding='utf-8') as infile:
            reader = csv.reader(infile)
            # Read header row if present, otherwise assume no header
            try:
                header = next(reader)
                print("Header found:", header)
                rows = [header]
                # The original requirement implies copying unmodified rows too,
                # but if the data starts with a header, we need to treat the header
                # as copied unmodified. If no header, we copy all rows.
                data_rows = reader
            except StopIteration:
                print("Input file is empty.")
                return

            # Process rows
            for row in data_rows:
                if len(row) < 8:
                    # Skip or handle malformed rows
                    print(f"Skipping malformed row: {row}")
                    rows.append(row)
                    continue

                # Assuming Title is at index 6 and Description slot is at index 7
                title = row[6]
                description = row[7] if len(row) > 7 else ""
                
                match = re.search(r'\((.*?)\)$', title)
                
                if match:
                    extracted_text = match.group(1)
                    # New title: original title minus the parenthetical part
                    new_title = title[:match.start()] + title[match.end():]
                    
                    # Append extracted text to description
                    if description:
                        new_description = f"{description} {extracted_text}"
                    else:
                        new_description = extracted_text
                    
                    # Create the modified row
                    # Replace the Title (index 6) and update the Description (index 7)
                    modified_row = list(row)
                    modified_row[6] = new_title.strip()
                    modified_row[7] = new_description.strip()
                    rows.append(modified_row)
                else:
                    # Unmodified row
                    rows.append(row)

        # Write all rows (modified and unmodified) to the output file
        with open(output_filepath, mode='w', newline='', encoding='utf-8') as outfile:
            writer = csv.writer(outfile)
            writer.writerows(rows)
        
        print("Successfully processed and saved data to", output_filepath)

    except FileNotFoundError:
        print(f"Error: The input file was not found at {input_filepath}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    # Define relative paths based on script location (D:\Projects\cochonbank2\scripts\)
    # Relative to scripts folder: ..\data\
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, "..", "data")
    INPUT_FILE = os.path.join(data_dir, "transactions.csv")
    OUTPUT_FILE = os.path.join(data_dir, "transactions_fixed.csv")
    
    split_title_and_description(INPUT_FILE, OUTPUT_FILE)