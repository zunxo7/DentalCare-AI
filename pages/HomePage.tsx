import React from 'react';
import { useNavigate } from 'react-router-dom';

const HomePage: React.FC = () => {
    const navigate = useNavigate();

    const starterQuestions = [
        "How often will I see the orthodontist?",
        "What do I do if a bracket or a wire comes loose?",
        "Do braces cause discomfort?",
        "How often should I brush?",
    ];

    const handleQuestionClick = (question: string) => {
        navigate('/chat', { state: { starterQuestion: question } });
    };

    return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-background p-4 text-center">
            <div className="max-w-3xl w-full">
                <div className="mb-12 animate-fade-in-down">
                    <h1 className="text-4xl md:text-5xl font-bold text-text-primary">Welcome to Dental Care</h1>
                    <p className="text-lg text-text-secondary mt-4 max-w-xl mx-auto">
                        Ask me anything about our dental services or procedures.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up">
                    {starterQuestions.map((q, i) => (
                        <button
                            key={i}
                            onClick={() => handleQuestionClick(q)}
                            className="text-left p-5 bg-surface rounded-xl border border-border hover:bg-surface-light hover:border-primary transition-all duration-200 text-text-primary"
                        >
                            {q}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default HomePage;
