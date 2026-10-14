**POST /api/chatbot/initiate-chat** this api initates data into chat_context which will be used to seed some input parameters to the llm. like weather, number of people (as setup), vegiterial boolean.  it uses the function **backend\app\chatbot\internal_tools\initiatemycart.py** which basicaly creates an empty cart or loads existing cart because llm writes to the cart to craft the order of a person. 

**backend\app\chatbot\tools\fullmenu.py** this function is used to pass the full menu of the cafe to llm, it only passes the name of menu and category and subcategory, it is there because it only gives the menu format of the llm what metters, if we give ids, uploads etc to the llm, the llm context window will fill up with un-nessasory inputs.

**backend\app\chatbot\tools\viewmycart.py** this function also does the same thing, it passes the simplified verson of the cart to the llm, by trimming off unnessasory things. 


**backend\app\chatbot\tools\context.py** this also does exactly the same thing. it passes the context veriables to the llm, so that llm has idea about current time, weather, veg-nonveg, number of people etc.

**backend\app\chatbot\validators** for simplecity llm respondes only in strings and dosent have to deal with ids (because it might get confused and shuffle the ids). these **validators** resolve ids from the strings using fuzzy search

**backend\app\chatbot\pydantic_validators** are used to validate jsons recieved from the llm

**backend\app\chatbot\internal_tools\process_food_listing_from_llm.py** during the conversations, the llm always returns the item suggestions to the person based on his inputs, in json format to the code. this function picks it up and converts into a item-menu json that can be rendered by the frontend. it is used to disply the item suggested by the llm and place order. 

