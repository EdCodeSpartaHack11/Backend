#include <iostream>
#include <string>

int main() 
{
    std::string input;
    std::cin >> input;
    if (input == "1"){
        std::cout << "Hello";
    }
    else if (input == "2"){
        std::cout << "No";
    }
}