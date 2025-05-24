def timeConversion(s):
    # Write your code here
    splitted_string = s.split(":")
    
    #check if string is in pm
    if "PM" in s:
        splitted_string[0]= str(12 + int(splitted_string[0]))
    
    #remove the PM AM string
    new_str = ":".join(splitted_string)
    new_str = new_str.replace("PM", " ")
    new_str= new_str.replace("AM", "")
    return new_str

s= "07:05:45PM"
result = timeConversion(s)
print(result)