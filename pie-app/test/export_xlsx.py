import openpyxl,sys,json,warnings,datetime,zipfile,re,posixpath
warnings.filterwarnings("ignore")
wbv=openpyxl.load_workbook(sys.argv[1],data_only=True)
wbf=openpyxl.load_workbook(sys.argv[1])
# validaciones de datos (incluidas las x14 que openpyxl descarta)
z=zipfile.ZipFile(sys.argv[1])
rels=dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"',z.read('xl/_rels/workbook.xml.rels').decode()))
sheetfile={n:rels[i] for n,i in re.findall(r'<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"',z.read('xl/workbook.xml').decode())}
def dvs(name):
    x=z.read(posixpath.join('xl',sheetfile[name])).decode()
    out=[]
    for a,f,q in re.findall(r'<x14:dataValidation ([^>]*)>.*?<xm:f>(.*?)</xm:f>.*?<xm:sqref>(.*?)</xm:sqref>',x,re.S):
        out.append({"formula":f,"sqref":q,"strict":'showErrorMessage="1"' in a and 'errorStyle=' not in a})
    for a,f in re.findall(r'<dataValidation ([^>]*)>\s*<formula1>(.*?)</formula1>',x,re.S):
        q=re.search(r'sqref="([^"]+)"',a).group(1)
        out.append({"formula":f,"sqref":q,"strict":'showErrorMessage="1"' in a and 'errorStyle=' not in a})
    return out
out=[]
for ws in wbv.worksheets:
    wf=wbf[ws.title]
    rows=[]
    for r in range(1,ws.max_row+1):
        row=[]
        for c in range(1,ws.max_column+1):
            v=ws.cell(r,c).value; f=wf.cell(r,c).value
            if isinstance(v,datetime.datetime): v={"$d":v.strftime("%Y-%m-%d")}
            if isinstance(f,str) and f.startswith("="): row.append({"$f":f,"v":v})
            else: row.append(v)
        rows.append(row)
    out.append({"name":ws.title,"hidden":ws.sheet_state!="visible","values":rows,
      "heights":{r:ws.row_dimensions[r].height for r in range(1,ws.max_row+1) if ws.row_dimensions[r].height},
      "merges":[str(m) for m in ws.merged_cells.ranges],"dv":dvs(ws.title)})
json.dump(out,open(sys.argv[2],"w"))
