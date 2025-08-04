import pandas as pd

# Load Excel file
excel_path = r"E:\bijonsikha-website\data\Service_List.xlsx"
df = pd.read_excel(excel_path)

# Replace NaNs with empty string
df.fillna("", inplace=True)

# Replace checkmarks with green tick HTML
df = df.replace("✔", '<span style="color:green; font-weight:bold;">&#10004;</span>')

# Convert to HTML table with class for styling
html_table = df.to_html(classes="service-table", index=False, border=0, justify="center", escape=False)

# Save to output file
output_path = r"E:\bijonsikha-website\data\service_table.html"
with open(output_path, "w", encoding="utf-8") as f:
    f.write(html_table)

print("✅ HTML table exported to service_table.html")
