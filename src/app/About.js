import React, { useState, useEffect } from 'react';
import PageHeader from '../shared/components/layout/PageHeader';

const About = () => {
    const [aboutContent, setAboutContent] = useState({
        StoryTitle: 'Our Story',
        StorySubtitle: 'Crafting Excellence Since 2000',
        StoryDescription: 'What began as a small workshop has grown into a leading provider of premium office furniture solutions. Our commitment to quality, innovation and customer satisfaction has been our guiding principle.',
        ProjectsCount: '2000+',
        ClientsCount: '500+',
        StoryImageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=400&fit=crop',
        MissionTitle: 'Our Mission',
        MissionDescription: 'We strive to transform workspaces into inspiring environments where creativity flourishes and productivity soars. Through innovative design and unwavering attention to detail, we create furniture solutions that perfectly balance form and function.',
        Feature1: 'Premium Materials',
        Feature2: 'Ergonomic Design',
        Feature3: 'Sustainable Practices',
        MissionImageUrl: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&h=400&fit=crop',
        ValuesTitle: 'Our Values',
        Value1Title: 'Innovation',
        Value1Description: 'Pushing boundaries in design and functionality',
        Value2Title: 'Quality',
        Value2Description: 'Uncompromising commitment to excellence',
        Value3Title: 'Service',
        Value3Description: 'Dedicated to exceeding expectations',
        Value4Title: 'Sustainability',
        Value4Description: 'Committed to environmental responsibility',
        PhilosophyTitle: 'Design Philosophy',
        PhilosophySubtitle: 'Every element of our brand reflects our commitment to clean, modern design',
        PhilosophyDescription: 'Our design language embraces simplicity and clarity. We use clean, modern typography that enhances readability and creates a professional, approachable aesthetic. Every font choice is carefully considered to reflect our values of innovation and quality.',
        Typo1Title: 'Clean & Modern',
        Typo1Description: 'Sans-serif fonts that provide excellent readability across all devices',
        Typo2Title: 'Consistent Hierarchy',
        Typo2Description: 'Well-defined text sizes and weights that guide user attention',
        Typo3Title: 'Accessible Design',
        Typo3Description: 'High contrast ratios and legible font sizes for all users'
    });

    useEffect(() => {
        const fetchAboutContent = async () => {
            try {
                const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
                const response = await fetch(`${apiBase}/api/about`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.content) {
                        // Map the API response to the expected format
                        setAboutContent({
                            StoryTitle: data.content.ourStoryTitle || 'Our Story',
                            StorySubtitle: data.content.storySubtitle || 'Crafting Excellence Since 2000',
                            StoryDescription: data.content.ourStoryContent || 'What began as a small workshop has grown into a leading provider of premium office furniture solutions. Our commitment to quality, innovation and customer satisfaction has been our guiding principle.',
                            ProjectsCount: data.content.projectsCount || '2000+',
                            ClientsCount: data.content.clientsCount || '500+',
                            StoryImageUrl: data.content.storyImageUrl || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=400&fit=crop',
                            MissionTitle: data.content.missionTitle || 'Our Mission',
                            MissionDescription: data.content.missionContent || 'We strive to transform workspaces into inspiring environments where creativity flourishes and productivity soars. Through innovative design and unwavering attention to detail, we create furniture solutions that perfectly balance form and function.',
                            Feature1: data.content.feature1 || 'Premium Materials',
                            Feature2: data.content.feature2 || 'Ergonomic Design',
                            Feature3: data.content.feature3 || 'Sustainable Practices',
                            MissionImageUrl: data.content.missionImageUrl || 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&h=400&fit=crop',
                            ValuesTitle: data.content.visionTitle || 'Our Values',
                            Value1Title: data.content.value1Title || 'Innovation',
                            Value1Description: data.content.value1Description || 'Pushing boundaries in design and functionality',
                            Value2Title: data.content.value2Title || 'Quality',
                            Value2Description: data.content.value2Description || 'Uncompromising commitment to excellence',
                            Value3Title: data.content.value3Title || 'Service',
                            Value3Description: data.content.value3Description || 'Dedicated to exceeding expectations',
                            Value4Title: data.content.value4Title || 'Sustainability',
                            Value4Description: data.content.value4Description || 'Committed to environmental responsibility',
                            PhilosophyTitle: data.content.philosophyTitle || 'Design Philosophy',
                            PhilosophySubtitle: data.content.philosophySubtitle || 'Every element of our brand reflects our commitment to clean, modern design',
                            PhilosophyDescription: data.content.philosophyDescription || 'Our design language embraces simplicity and clarity. We use clean, modern typography that enhances readability and creates a professional, approachable aesthetic. Every font choice is carefully considered to reflect our values of innovation and quality.',
                            Typo1Title: data.content.typo1Title || 'Clean & Modern',
                            Typo1Description: data.content.typo1Description || 'Sans-serif fonts that provide excellent readability across all devices',
                            Typo2Title: data.content.typo2Title || 'Consistent Hierarchy',
                            Typo2Description: data.content.typo2Description || 'Well-defined text sizes and weights that guide user attention',
                            Typo3Title: data.content.typo3Title || 'Accessible Design',
                            Typo3Description: data.content.typo3Description || 'High contrast ratios and legible font sizes for all users',
                            Layout: data.content.layout || 'default'
                        });
                    }
                }
            } catch (error) {
                // Error fetching about content
            }
        };

        fetchAboutContent();
    }, []);

    const renderDefault = () => (
        <>
            {/* Our Story */}
            <section className="about-band about-band--story">
                <div className="container">
                    <div className="about-card">
                        <div className="about-split">
                            <div className="about-split__content">
                                <div className="about-section-header">
                                    <span className="about-eyebrow">{aboutContent.StoryTitle}</span>
                                    <h2 className="about-heading">{aboutContent.StorySubtitle}</h2>
                                </div>

                                <p className="about-body">{aboutContent.StoryDescription}</p>

                                <div className="about-stats">
                                    <div className="about-stat">
                                        <div className="about-stat__value">{aboutContent.ProjectsCount}</div>
                                        <div className="about-stat__label">Projects Completed</div>
                                    </div>
                                    <div className="about-stat">
                                        <div className="about-stat__value">{aboutContent.ClientsCount}</div>
                                        <div className="about-stat__label">Happy Clients</div>
                                    </div>
                                </div>
                            </div>

                            <div className="about-split__media">
                                <img
                                    className="about-media"
                                    src={aboutContent.StoryImageUrl || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=400&fit=crop'}
                                    alt="Modern office workspace"
                                    loading="lazy"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Our Mission */}
            <section className="about-band about-band--tinted">
                <div className="container">
                    <div className="about-card">
                        <div className="about-split about-split--reverse">
                            <div className="about-split__media">
                                <img
                                    className="about-media"
                                    src={aboutContent.MissionImageUrl || 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&h=400&fit=crop'}
                                    alt="Office design consultation"
                                    loading="lazy"
                                />
                            </div>

                            <div className="about-split__content">
                                <div className="about-section-header">
                                    <span className="about-eyebrow">Our Mission</span>
                                    <h2 className="about-heading">{aboutContent.MissionTitle}</h2>
                                </div>

                                <p className="about-body">{aboutContent.MissionDescription}</p>

                                <div className="about-feature-list">
                                    {aboutContent.Feature1 && (
                                        <div className="about-feature">
                                            <span className="about-feature__icon">✓</span>
                                            <span className="about-feature__text">{aboutContent.Feature1}</span>
                                        </div>
                                    )}
                                    {aboutContent.Feature2 && (
                                        <div className="about-feature">
                                            <span className="about-feature__icon">✓</span>
                                            <span className="about-feature__text">{aboutContent.Feature2}</span>
                                        </div>
                                    )}
                                    {aboutContent.Feature3 && (
                                        <div className="about-feature">
                                            <span className="about-feature__icon">✓</span>
                                            <span className="about-feature__text">{aboutContent.Feature3}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Our Values */}
            <section className="about-band">
                <div className="container">
                    <div className="about-section-header about-section-header--center">
                        <span className="about-eyebrow">{aboutContent.ValuesTitle}</span>
                    </div>

                    <div className="about-values-grid">
                        <div className="about-value-card">
                            <div className="about-value-icon">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" fill="#F0B21B"/>
                                </svg>
                            </div>
                            <h3 className="about-value-title">{aboutContent.Value1Title}</h3>
                            <p className="about-value-desc">{aboutContent.Value1Description}</p>
                        </div>

                        <div className="about-value-card">
                            <div className="about-value-icon">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#F0B21B"/>
                                    <path d="M9 12L11 14L15 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <h3 className="about-value-title">{aboutContent.Value2Title}</h3>
                            <p className="about-value-desc">{aboutContent.Value2Description}</p>
                        </div>

                        <div className="about-value-card">
                            <div className="about-value-icon">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="12" cy="12" r="10" fill="#F0B21B"/>
                                    <path d="M8 14S9.5 16 12 16S16 14 16 14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                                    <circle cx="9" cy="9" r="1" fill="white"/>
                                    <circle cx="15" cy="9" r="1" fill="white"/>
                                </svg>
                            </div>
                            <h3 className="about-value-title">{aboutContent.Value3Title}</h3>
                            <p className="about-value-desc">{aboutContent.Value3Description}</p>
                        </div>

                        <div className="about-value-card">
                            <div className="about-value-icon">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1L13.5 2.5L16.17 5.17L10.5 10.84L6.83 7.17L2 12L3.41 13.41L6.83 10L10.5 13.67L16.17 8L18.83 10.67L17 12.5L19 14.5L21 9Z" fill="#F0B21B"/>
                                </svg>
                            </div>
                            <h3 className="about-value-title">{aboutContent.Value4Title}</h3>
                            <p className="about-value-desc">{aboutContent.Value4Description}</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Design Philosophy */}
            <section className="about-band about-band--tinted">
                <div className="container">
                    <div className="about-section-header about-section-header--center">
                        <span className="about-eyebrow">{aboutContent.PhilosophyTitle}</span>
                        {aboutContent.PhilosophySubtitle ? (
                            <p className="about-subheading">{aboutContent.PhilosophySubtitle}</p>
                        ) : null}
                    </div>

                    <div className="about-card">
                        <div className="about-split about-split--top">
                            <div className="about-split__content">
                                <h3 className="about-mini-heading">Typography & Visual Identity</h3>
                                <p className="about-body">{aboutContent.PhilosophyDescription}</p>

                                <div className="about-typo-grid">
                                    <div className="about-typo-card">
                                        <div className="about-typo-title">{aboutContent.Typo1Title}</div>
                                        <div className="about-typo-desc">{aboutContent.Typo1Description}</div>
                                    </div>
                                    <div className="about-typo-card">
                                        <div className="about-typo-title">{aboutContent.Typo2Title}</div>
                                        <div className="about-typo-desc">{aboutContent.Typo2Description}</div>
                                    </div>
                                    <div className="about-typo-card">
                                        <div className="about-typo-title">{aboutContent.Typo3Title}</div>
                                        <div className="about-typo-desc">{aboutContent.Typo3Description}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="about-split__content">
                                <div className="about-font-showcase">
                                    <div className="about-font-example">
                                        <div className="about-font-display">Office Excellence</div>
                                        <div className="about-font-label">Primary heading</div>
                                    </div>
                                    <div className="about-font-example">
                                        <div className="about-font-subtitle">Modern Workspace Solutions</div>
                                        <div className="about-font-label">Subtitle</div>
                                    </div>
                                    <div className="about-font-example">
                                        <div className="about-font-body">
                                            Our carefully selected typography creates a harmonious reading experience that reflects our commitment to quality and attention to detail.
                                        </div>
                                        <div className="about-font-label">Body text</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );

    const renderMinimal = () => (
        <>
            <section style={{ padding: '12px 0' }}>
                <h1 style={{ marginBottom: 8 }}>{aboutContent.StoryTitle}</h1>
                <h3 style={{ marginTop: 0, color: '#666' }}>{aboutContent.StorySubtitle}</h3>
                <p>{aboutContent.StoryDescription}</p>
                <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
                    <div><strong>{aboutContent.ProjectsCount}</strong> Projects</div>
                    <div><strong>{aboutContent.ClientsCount}</strong> Clients</div>
                </div>
                {aboutContent.StoryImageUrl && (
                    <img src={aboutContent.StoryImageUrl} alt="Story" style={{ marginTop: 16, maxWidth: '100%', borderRadius: 8 }} />
                )}
            </section>
            <hr />
            <section style={{ padding: '12px 0' }}>
                <h2 style={{ marginBottom: 8 }}>{aboutContent.MissionTitle}</h2>
                <p>{aboutContent.MissionDescription}</p>
                <ul style={{ marginTop: 12 }}>
                    {aboutContent.Feature1 && <li>{aboutContent.Feature1}</li>}
                    {aboutContent.Feature2 && <li>{aboutContent.Feature2}</li>}
                    {aboutContent.Feature3 && <li>{aboutContent.Feature3}</li>}
                </ul>
                {aboutContent.MissionImageUrl && (
                    <img src={aboutContent.MissionImageUrl} alt="Mission" style={{ marginTop: 16, maxWidth: '100%', borderRadius: 8 }} />
                )}
            </section>
            <hr />
            <section style={{ padding: '12px 0' }}>
                <h2 style={{ marginBottom: 8 }}>{aboutContent.ValuesTitle}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
                    <div><h4>{aboutContent.Value1Title}</h4><p>{aboutContent.Value1Description}</p></div>
                    <div><h4>{aboutContent.Value2Title}</h4><p>{aboutContent.Value2Description}</p></div>
                    <div><h4>{aboutContent.Value3Title}</h4><p>{aboutContent.Value3Description}</p></div>
                    <div><h4>{aboutContent.Value4Title}</h4><p>{aboutContent.Value4Description}</p></div>
                </div>
            </section>
            <hr />
            <section style={{ padding: '12px 0' }}>
                <h2 style={{ marginBottom: 8 }}>{aboutContent.PhilosophyTitle}</h2>
                {aboutContent.PhilosophySubtitle && <p style={{ color: '#666' }}>{aboutContent.PhilosophySubtitle}</p>}
                <p>{aboutContent.PhilosophyDescription}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginTop: 12 }}>
                    <div><h4>{aboutContent.Typo1Title}</h4><p>{aboutContent.Typo1Description}</p></div>
                    <div><h4>{aboutContent.Typo2Title}</h4><p>{aboutContent.Typo2Description}</p></div>
                    <div><h4>{aboutContent.Typo3Title}</h4><p>{aboutContent.Typo3Description}</p></div>
                </div>
            </section>
        </>
    );

    return (
        <div className="about-page">
            <PageHeader
                breadcrumbs={[
                    { label: 'Home', href: '/' },
                    { label: 'About Us' }
                ]}
                title="About Us"
                subtitle="Learn more about our story, mission, and values"
            />
            {aboutContent.Layout === 'minimal' ? (
                <div className="container">{renderMinimal()}</div>
            ) : (
                renderDefault()
            )}
        </div>
    );
};

export default About;
