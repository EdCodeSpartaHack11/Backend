#include <iostream>
#include <fstream>
#include <vector>
#include <deque>
#include <algorithm>
#include <sstream>


using namespace std;
struct Process
{
    int pid;
    int priority;
    deque <string> actions;
} ;
struct BlockedProcess
{
    Process * process;
    int remaining;
};
bool priorityCompare(Process * p1, Process * p2)
{
    return p1->priority > p2->priority;
}


int extract_trailing_int(const std::string& s) {
    size_t end = s.find_last_not_of(" \t\r\n");
    if (end == std::string::npos) return 0;

    size_t last_digit = end;
    while (last_digit != std::string::npos &&
           !std::isdigit(static_cast<unsigned char>(s[last_digit]))) {
        if (last_digit == 0) return 0;
        --last_digit;
    }
    if (!std::isdigit(static_cast<unsigned char>(s[last_digit]))) return 0;

    size_t first_digit = last_digit;
    while (first_digit != 0 &&
           std::isdigit(static_cast<unsigned char>(s[first_digit - 1]))) {
        --first_digit;
    }

    return std::stoi(s.substr(first_digit, last_digit - first_digit + 1));
}



int main(int argc, char *argv[])
{
    ostream& logFile = cout;


    //ofstream logFile("LOG.txt");

    deque < Process *> ready;
    deque < BlockedProcess > blocked;
    string line;
    bool debug = false;
    int input_process_files = 0;

    string input_line;
    getline(cin, input_line);

    // Tokenize like argv
    vector<string> args;
    string token;
    stringstream ss(input_line);
    while (ss >> token) {
        args.push_back(token);
    }

    // Parse arguments (same logic as before)
    for (const string& arg : args) {
        if (arg == "-debug") {
            debug = true;
        }
        if (!arg.empty() && all_of(arg.begin(), arg.end(), ::isdigit)) {
            input_process_files = stoi(arg);
        }
    }




    for (int i = 0; i < input_process_files; i++)
    {

        string filename = "process" + to_string(i + 1);
        ifstream file(filename);
        if (!file.is_open()) {
            cerr << "Error: Cannot open " << filename << endl;
            continue;
        }
        getline(file, line);
        int priority = stoi(line);
        Process* process = new Process();
        process->pid = i + 1;
        process->priority = priority;
        while (getline(file, line))
        {
            process->actions.push_back(line);
        }
        ready.push_back(process);
        file.close();
    }

    stable_sort(ready.begin(), ready.end(), priorityCompare);


    Process * running = nullptr;
    int system_timer = 0;
    int interrupt_timer = 0;
    while (running || !ready.empty() || !blocked.empty())
    {


        if (!running && !ready.empty())
        {
            running = ready.front();
            ready.pop_front();

            logFile << system_timer << ": " << "Process " << running->pid << ": Ready -> Running" << endl;

            interrupt_timer = 0;
        }

        else
        {

            if (running == nullptr && ready.empty()) {
                if (!blocked.empty()) {
                    logFile << system_timer << ": CPU Idle" << endl;

                }
                ++system_timer;

            }

            else {

            string action = running->actions.front();
            running->actions.pop_front();

            if (debug) {
                logFile << system_timer << ": " << "Process " << running->pid << ": "  << action << endl;
            }

            ++system_timer;
            ++interrupt_timer;
            if  (action.find("SYS_CALL") != string::npos)
            {
                if (action.find("TERMINATE") != string::npos)
                {
                    logFile << system_timer << ": " << "Process " << running->pid << ": Running -> Halted" << endl;
                    delete running;
                    running = nullptr;
                    interrupt_timer = 0;
                    continue;
                }
                if (action.find("IO") != string::npos || action.find("NETWORK") != string::npos)
                {
                    int halted_cycles = extract_trailing_int(action);
                    logFile << system_timer << ": Process " << running->pid << ": Running -> Blocked" << endl;
                    blocked.push_back({running, halted_cycles});
                    running = nullptr;
                    interrupt_timer = 0;

                    continue;
                }
            }
            if (running->actions.empty()) {
                logFile << system_timer << ": Process " << running->pid << ": Running -> Halted\n";
                delete running;
                running = nullptr;
                interrupt_timer = 0;

                continue;
            }


            if (interrupt_timer == 5)
            {
                logFile << system_timer << ": " << "Process " << running->pid << ": Running -> Ready" << endl;
                ready.push_back(running);
                interrupt_timer = 0;
                running = nullptr;
                continue;
            }

        }
        if (!blocked.empty())
            {
                for (auto it = blocked.begin(); it != blocked.end();) {
                    it->remaining--;
                    if (it->remaining == 0) {
                        logFile << system_timer << ": Process " << it->process->pid << ": Blocked -> Ready" << endl;
                        ready.push_back(it->process);
                        it = blocked.erase(it);
                    } else {
                        ++it;

                    }
                }

            }

        }

    }
    //logFile.close();
    return 0;
}
