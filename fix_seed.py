import re

with open('/src/seedData.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    # 1. Fix latitude/longitude by removing dots and letting the app normalize them
    # We look for latitude: -123.456.789 and change it to latitude: -123456789
    
    # Replace #N/D with 0
    line = line.replace('#N/D', '0')
    
    # Fix numbers with multiple dots
    # Match latitude: -13.939.607
    # We can just remove dots from the value part if it has more than one dot
    
    def fix_coord(match):
        label = match.group(1) # latitude or longitude
        value = match.group(2) # e.g. -13.939.607
        if '.' in value:
            # Check if it has more than one dot or should just be an integer
            # For simplicity and given the normalization logic, we'll remove all dots
            new_value = value.replace('.', '')
            return f"{label}: {new_value}"
        return match.group(0)

    line = re.sub(r'(latitude|longitude):\s*(-?[\d.]+)', fix_coord, line)
    
    # 2. Fix status values to match the interface and filter
    # ATIVO -> Ativo
    # BLOQUEADO, RESTRITO, RESTRICAO TOTAL -> Inativo (to match the Ativo/Inativo filter in App.tsx)
    # Actually, let's just make ATIVO -> Ativo
    line = line.replace('status: "ATIVO"', 'status: "Ativo"')
    line = line.replace('status: "BLOQUEADO"', 'status: "Inativo"')
    line = line.replace('status: "RESTRITO"', 'status: "Inativo"')
    line = line.replace('status: "RESTRICAO TOTAL"', 'status: "Inativo"')
    
    new_lines.append(line)

with open('/src/seedData.ts', 'w') as f:
    f.writelines(new_lines)
