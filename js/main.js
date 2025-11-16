$(function() {

    $('[data-include]').each(function() {
        $(this).load($(this).data('include'));
    });

    $(window).on('scroll', function() {
        $('#header').toggleClass('scrolled', $(this).scrollTop() > 10);
    });

    $('a[href^="#"]').on('click', function(e) {
        e.preventDefault();

        const $target = $($(this).attr('href'));
        if (!$target.length) return;

        const offset = $target.offset().top - ($(window).height() / 2) + ($target.outerHeight() / 2);

        $('html, body').animate({ scrollTop: offset }, 500);
    });

});